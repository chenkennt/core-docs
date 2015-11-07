var fs = require("fs");
var path = require("path");
var url = require("url");
var cheerio = require("cheerio");
var toMarkdown = require("to-markdown");

function remove(element, selector) {
  element.find(selector).remove();
}

function removeTag(element, selector) {
  replace(element, selector, function(e) {
    return e.html();
  });
}

function replace(element, selector, replacer) {
  visit(element, selector, function(e) {
    e.replaceWith(replacer(e));
  });
}

function visit(element, selector, visitor) {
  var elements = element.find(selector);
  // children should always appear after parent in jquery result?
  for (var i = elements.length - 1; i >= 0; i--) {
    visitor(cheerio(elements[i]));
  }
}

function changeExt(p, ext) {
  return p.slice(0, p.length - path.extname(p).length) + ext;
}

function fixLink(href) {
  // encode () as markdown cannot handle them in links well
  href = href.replace("(", "%28").replace(")", "%29");
  var u = url.parse(href);
  if (!u.host && u.pathname && !path.isAbsolute(u.pathname)) {
    if (path.extname(u.pathname) != ".html") console.log("invalid internal link: " + href);
    u.pathname = changeExt(u.pathname, ".md");
    return url.format(u);
  }
  return href;
}

function sanitize(body, srcPath, dstPath) {
  // Convert RTD html to a plain html
  // 1. Remove <noscript> and its children
  remove(body, "noscript");
  // 2. Remove permalink for heading
  remove(body, ".headerlink");
  // 3. Remove italic on all links
  removeTag(body, "a em");
  // 4. Change <cite> to <em>
  replace(body, "cite", function(e) {
    return "<em>" + e.html() + "</em>";
  });
  // 5. Fix code block with lines
  replace(body, "table.highlighttable", function(e) {
    return e.find(".highlight");
  });
  // 6. Fix code block
  replace(body, "div.highlight > pre", function(e) {
    var lang = e.parent().parent().attr("class");
    switch (lang) {
      case "highlight-c#": lang = "highlight-cs"; break;
      case "highlight-vb.net": lang = "highlight-vbnet"; break;
      case "highlight-c":
      case "highlight-json":
      case "highlight-console": break;
      default: console.log("uncognized language: " + lang); break;
    }
    // use language and replace to div later
    if (lang) return "<language class='highlight " + lang + "'><pre>" + e.html() + "</pre></language>";
    else return "<pre><code>" + e.html() + "</code></pre>";
  });
  // 7. Fix note, change <div class="note"> to <blockquote>
  replace(body, "div.note", function(e) {
    replace(e, "p.admonition-title", function(e) {
      return "<b>" + e.html() + "</b>";
    });
    return "<blockquote>" + e.html() + "</blockquote>";
  });
  // 8. Remove problematic links
  removeTag(body, "a:has(span.problematic)");
  // 9. Remove <div> and <span>
  removeTag(body, "div, span");
  // 10. Change language back to div
  replace(body, "language", function(e) {
    return "<div class='" + e.attr("class") + "'>" + e.html() + "</div>";
  });
  // 11. Fix links, change .html to .md for internal links
  visit(body, "a", function(e) {
    e.attr("href", fixLink(e.attr("href")));
  });
  // 12. Copy images
  visit(body, "img", function(e) {
    var href = e.attr("src");
    var u = url.parse(href);
    if (!u.host && u.pathname && !path.isAbsolute(u.pathname)) {
      try {
        fs.mkdirSync(path.dirname(path.join(dstPath, u.pathname)));
      } catch (e) {}
      fs.createReadStream(path.join(srcPath, u.pathname)).pipe(fs.createWriteStream(path.join(dstPath, u.pathname)));
    }
  });
  // 13. Fix table
  remove(body, "table > colgroup");

  return body;
}

function toToc(toc, prefix) {
  var content = "";
  if (prefix === undefined) prefix = "#";
  toc.children("li").each(function(i, c) {
    var child = cheerio(c);
    var link = child.children("a");
    content += prefix + " [" + link.text() + "](" + fixLink(link.attr("href")) + ")\n";
    content += toToc(child.children("ul"), prefix + "#");
  });
  return content;
}

function convert(src, dst) {
  fs.readdirSync(src).forEach(function(p) {
    if (fs.statSync(path.join(src, p)).isDirectory()) {
      convert(path.join(src, p), path.join(dst, p));
    } else if (path.extname(p) == ".html") {
      console.log("converting " + path.join(src, p));
      var html = fs.readFileSync(path.join(src, p), { encoding: "utf8" });
      var md = "";
      var body = cheerio.load(html)(".document");
      var toc = body.find("#topics > div > ul");
      if (toc.length > 0) md = toToc(toc);
      else md = toMarkdown(sanitize(body, src, dst).html(), { gfm: true });
      try {
        fs.mkdirSync(dst);
      } catch (e) {}
      // Fix wrench icon
      md = md.replace(/\|stub\-icon\|/g, "🔧");
      fs.writeFileSync(path.join(dst, p.slice(0, p.length - path.extname(p).length) + ".md"), md);
    }
  });
}

convert(process.argv[2], process.argv[3]);
