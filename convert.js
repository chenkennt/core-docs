var fs = require("fs");
var path = require("path");
var cheerio = require("cheerio");
var toMd = require("to-markdown");

function removeWithChildren(element, selector) {
  element.find(selector).remove();
}

function remove(element, selector) {
  var elements = element.find(selector);
  // children should always appear after parent in jquery result?
  for (var i = elements.length - 1; i >= 0; i--) {
    var toRemove = cheerio(elements[i]);
    toRemove.replaceWith(toRemove.html());
  }
}

function replace(element, selector, replacer) {
  var elements = element.find(selector);
  // children should always appear after parent in jquery result?
  for (var i = elements.length - 1; i >= 0; i--) {
    var toRemove = cheerio(elements[i]);
    toRemove.replaceWith(replacer(toRemove));
  }
}

function toMarkdown(body) {
  // Convert RTD html to a plain html
  // 1. Remove <noscript> and its children
  removeWithChildren(body, "noscript");
  // 2. Remove permalink for heading
  removeWithChildren(body, ".headerlink");
  // 3. Remove italic on all links
  remove(body, "a em");
  // 4. Change <cite> to <em>
  replace(body, "cite", function(e) {
    return "<em>" + e.html() + "</em>";
  });
  // 5. Fix code block with lines
  replace(body, ".highlighttable", function(e) {
    return e.find(".highlight");
  });
  // 6. Fix code block
  replace(body, ".highlight > pre", function(e) {
    return "<pre><code>" + e.html() + "</code></pre>";
  });
  // 7. Remove <div> and <span>
  remove(body, "div, span");

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
      var md = toMarkdown(body);
      try {
        fs.mkdirSync(dst);
      } catch (e) {}
      fs.writeFileSync(path.join(dst, p.slice(0, p.length - path.extname(p).length) + ".md"), md);
    }
  });
}

convert(process.argv[2], process.argv[3]);
