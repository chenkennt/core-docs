var fs = require("fs");
var path = require("path");
var url = require("url");
var cheerio = require("cheerio");
var toMd = require("to-markdown");

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

function toMarkdown(body, srcPath, dstPath) {
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
    return "<pre><code>" + e.html() + "</code></pre>";
  });
  // 7. Fix note, change <div class="note"> to <blockquote>
  replace(body, "div.note", function(e) {
    replace(e, "p.admonition-title", function(e) {
      return "<b>" + e.html() + "</b>";
    });
    return "<blockquote>" + e.html() + "</blockquote>";
  });
  // 8. Remove <div> and <span>
  removeTag(body, "div, span");
  // 9. Fix links, change .html to .md for internal links
  visit(body, "a", function(e) {
    var href = e.attr("href");
    var u = url.parse(href);
    if (!u.host && u.pathname && !path.isAbsolute(u.pathname)) {
      if (path.extname(u.pathname) != ".html") console.log("invalid internal link: " + href);
      u.pathname = changeExt(u.pathname, ".md");
      e.attr("href", url.format(u));
    }
  });
  // 10. Copy images
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

  return toMd(body.html(), { gfm: true });
}

function convert(src, dst) {
  fs.readdirSync(src).forEach(function(p) {
    if (fs.statSync(path.join(src, p)).isDirectory()) {
      convert(path.join(src, p), path.join(dst, p));
    } else if (path.extname(p) == ".html") {
      console.log("converting " + path.join(src, p));
      var html = fs.readFileSync(path.join(src, p), { encoding: "utf8" });
      var body = cheerio.load(html)(".document");
      var md = toMarkdown(body, src, dst);
      try {
        fs.mkdirSync(dst);
      } catch (e) {}
      fs.writeFileSync(path.join(dst, p.slice(0, p.length - path.extname(p).length) + ".md"), md);
    }
  });
}

convert(process.argv[2], process.argv[3]);
