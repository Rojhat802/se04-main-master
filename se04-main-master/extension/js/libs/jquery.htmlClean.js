/*
HTML Clean for jQuery   
Anthony Johnston
http://www.antix.co.uk    
    
version 1.4.0

$Revision: 99 $

requires jQuery http://jquery.com   

Use and distibution http://www.opensource.org/licenses/bsd-license.php

2010-04-02 allowedTags/removeTags added (white/black list) thanks to David Wartian (Dwartian)
2010-06-30 replaceStyles added for replacement of bold, italic, super and sub styles on a tag
2012-04-30 allowedAttributes added, an array of attributed allowed on the elements
2013-02-25 now will push non-inline elements up the stack if nested in an inline element
2013-02-25 comment element support added, removed by default, see AllowComments in options
*/
(function ($) {
    $.fn.htmlClean = function (options) {
        // iterate and html clean each matched element
        return this.each(function () {
            if (this.value) {
                this.value = $.htmlClean(this.value, options);
            } else {
                this.innerHTML = $.htmlClean(this.innerHTML, options);
            }
        });
    };

    // clean the passed html
    $.htmlClean = function (html, options) {
        options = $.extend({}, $.htmlClean.defaults, options);
        options.allowEmpty = tagAllowEmpty.concat(options.allowEmpty);

        var tagsRE = /(<(\/)?(\w+:)?([\w]+)([^>]*)>)|<!--(.*?--)>/gi;
        var attrsRE = /([\w\-]+)\s*=\s*(".*?"|'.*?'|[^\s>\/]*)/gi;

        var tagMatch;
        var root = new Element();
        var stack = [root];
        var container = root;

        if (options.bodyOnly) {
            // check for body tag
            if (tagMatch = /<body[^>]*>((\n|.)*)<\/body>/i.exec(html)) {
                html = tagMatch[1];
            }
        }
        html = html.concat("<xxx>"); // ensure last element/text is found
        var lastIndex;

        while (tagMatch = tagsRE.exec(html)) {
            var tag = tagMatch[6]
                ? new Tag("--", null, tagMatch[6], options)
                : new Tag(tagMatch[4], tagMatch[2], tagMatch[5], options);

            // add the text
            var text = html.substring(lastIndex, tagMatch.index);
            if (text.length > 0) {
                var child = container.children[container.children.length - 1];
                if (container.children.length > 0
                        && isText(child = container.children[container.children.length - 1])) {
                    // merge text
                    container.children[container.children.length - 1] = child.concat(text);
                } else {
                    container.children.push(text);
                }
            }
            lastIndex = tagsRE.lastIndex;

            if (tag.isClosing) {
                // find matching container
                if (popToTagName(stack, [tag.name])) {
                    stack.pop();
                    container = stack[stack.length - 1];
                }
            } else {
                // create a new element
                var element = new Element(tag);

                // add attributes
                var attrMatch;
                while (attrMatch = attrsRE.exec(tag.rawAttributes)) {

                    // check style attribute and do replacements
                    if (attrMatch[1].toLowerCase() == "style"
                        && options.replaceStyles) {

                        var renderParent = !tag.isInline;
                        for (var i = 0; i < options.replaceStyles.length; i++) {
                            if (options.replaceStyles[i][0].test(attrMatch[2])) {

                                if (!renderParent) {
                                    tag.render = false;
                                    renderParent = true;
                                }
                                container.children.push(element); // assumes not replaced
                                stack.push(element);
                                container = element; // assumes replacement is a container
                                // create new tag and element
                                tag = new Tag(options.replaceStyles[i][1], "", "", options);
                                element = new Element(tag);
                            }
                        }
                    }

                    if (tag.allowedAttributes != null
                            && (tag.allowedAttributes.length == 0
                            || $.inArray(attrMatch[1], tag.allowedAttributes) > -1)) {
                        element.attributes.push(new Attribute(attrMatch[1], attrMatch[2]));
                    }
                }
                // add required empty ones
                $.each(tag.requiredAttributes, function () {
                    var name = this.toString();
                    if (!element.hasAttribute(name)) element.attributes.push(new Attribute(name, ""));
                });

                // check for replacements
                for (var repIndex = 0; repIndex < options.replace.length; repIndex++) {
                    for (var tagIndex = 0; tagIndex < options.replace[repIndex][0].length; tagIndex++) {
                        var byName = typeof (options.replace[repIndex][0][tagIndex]) == "string";
                        if ((byName && options.replace[repIndex][0][tagIndex] == tag.name)
                                || (!byName && options.replace[repIndex][0][tagIndex].test(tagMatch))) {

                            // set the name to the replacement
                            tag.rename(options.replace[repIndex][1]);

                            repIndex = options.replace.length; // break out of both loops
                            break;
                        }
                    }
                }

                // check container rules
                var add = true;
                if (!container.isRoot) {
                    if (container.tag.isInline && !tag.isInline) {
                        if (add = popToContainer(stack)) {
                            container = stack[stack.length - 1];
                        }
                    } else if (container.tag.disallowNest && tag.disallowNest
                                && !tag.requiredParent) {
                        add = false;
                    } else if (tag.requiredParent) {
                        if (add = popToTagName(stack, tag.requiredParent)) {
                            container = stack[stack.length - 1];
                        }
                    }
                }

                if (add) {
                    container.children.push(element);

                    if (tag.toProtect) {
                        // skip to closing tag
                        var tagMatch2;
                        while (tagMatch2 = tagsRE.exec(html)) {
                            var tag2 = new Tag(tagMatch2[4], tagMatch2[1], tagMatch2[5], options);
                            if (tag2.isClosing && tag2.name == tag.name) {
                                element.children.push(RegExp.leftContext.substring(lastIndex));
                                lastIndex = tagsRE.lastIndex;
                                break;
                            }
                        }
                    } else {
                        // set as current container element
                        if (!tag.isSelfClosing && !tag.isNonClosing) {
                            stack.push(element);
                            container = element;
                        }
                    }
                }
            }
        }

        // render doc
        return $.htmlClean.trim(render(root, options).join(""));
    };

    // defaults
    $.htmlClean.defaults = {
        // only clean the body tagbody
        bodyOnly: true,
        // only allow tags in this array, (white list), contents still rendered
        allowedTags: [],
        // remove tags in this array, (black list), contents still rendered
        removeTags: ["basefont", "center", "dir", "font", "frame", "frameset", "iframe", "isindex", "menu", "noframes", "s", "strike", "u"],
        // array of [attributeName], [optional array of allowed on elements] e.g. [["id"], ["style", ["p", "dl"]]] // allow all elements to have id and allow style on 'p' and 'dl'
        allowedAttributes: [],
        // array of attribute names to remove on all elements in addition to those not in tagAttributes e.g ["width", "height"]
        removeAttrs: [],
        // array of [className], [optional array of allowed on elements] e.g. [["aClass"], ["anotherClass", ["p", "dl"]]]
        allowedClasses: [],
        // format the result
        format: false,
        // format indent to start on
        formatIndent: 0,
        // tags to replace, and what to replace with, tag name or regex to match the tag and attributes 
        replace: [
            [["b", "big"], "strong"],
            [["i"], "em"]
        ],
        // styles to replace with tags, multiple style matches supported, inline tags are replaced by the first match blocks are retained
        replaceStyles: [
            [/font-weight:\s*bold/i, "strong"],
            [/font-style:\s*italic/i, "em"],
            [/vertical-align:\s*super/i, "sup"],
            [/vertical-align:\s*sub/i, "sub"]
        ],
        allowComments: false,
        allowEmpty: []
    };

    function applyFormat(element, options, output, indent) {
        if (element.tag.format && output.length > 0) {
            output.push("\n");
            for (var i = 0; i < indent; i++) output.push("\t");
        }
    }

    function render(element, options) {
        var output = [], empty = element.attributes.length == 0, indent = 0;

        if (element.tag.isComment) {
            if (options.allowComments) {
                output.push("<!--");
                output.push(element.tag.rawAttributes);
                output.push(">");

                if (options.format) applyFormat(element, options, output, indent - 1);
            }
        } else {

            // don't render if not in allowedTags or in removeTags
            var renderTag
                = element.tag.render
                    && (options.allowedTags.length == 0 || $.inArray(element.tag.name, options.allowedTags) > -1)
                    && (options.removeTags.length == 0 || $.inArray(element.tag.name, options.removeTags) == -1);

            if (!element.isRoot && renderTag) {

                // render opening tag
                output.push("<");
                output.push(element.tag.name);
                $.each(element.attributes, function () {
                    if ($.inArray(this.name, options.removeAttrs) == -1) {
                        var m = RegExp(/^(['"]?)(.*?)['"]?$/).exec(this.value);
                        var value = m[2];
                        var valueQuote = m[1] || "'";

                        // check for classes allowed                    
                        if (this.name == "class" && options.allowedClasses.length > 0) {
                            value =
                            $.grep(value.split(" "), function (c) {
                                return $.grep(options.allowedClasses, function (a) {
                                    return a == c
                                        || (a[0] == c && (a.length == 1 || $.inArray(element.tag.name, a[1]) > -1));
                                }).length > 0;
                            })
                            .join(" ");
                        }

                        if (value != null && (value.length > 0 || $.inArray(this.name, element.tag.requiredAttributes) > -1)) {
                            output.push(" ");
                            output.push(this.name);
                            output.push("=");
                            output.push(valueQuote);
                            output.push(value);
                            output.push(valueQuote);
                        }
                    }
                });
            }

            if (element.tag.isSelfClosing) {
                // self closing 
                if (renderTag) output.push(" />");
                empty = false;
            } else if (element.tag.isNonClosing) {
                empty = false;
            } else {
                if (!element.isRoot && renderTag) {
                    // close
                    output.push(">");
                }

                indent = options.formatIndent++;

                // render children
                if (element.tag.toProtect) {
                    outputChildren = $.htmlClean.trim(element.children.join("")).replace(/<br>/ig, "\n");
                    output.push(outputChildren);
                    empty = outputChildren.length == 0;
                } else {
                    var outputChildren = [];
                    for (var i = 0; i < element.children.length; i++) {
                        var child = element.children[i];
                        var text = $.htmlClean.trim(textClean(isText(child) ? child : child.childrenToString()));
                        if (isInline(child)) {
                            if (i > 0 && text.length > 0
                        && (startsWithWhitespace(child) || endsWithWhitespace(element.children[i - 1]))) {
                                outputChildren.push(" ");
                            }
                        }
                        if (isText(child)) {
                            if (text.length > 0) {
                                outputChildren.push(text);
                            }
                        } else {
                            // don't allow a break to be the last child
                            if (i != element.children.length - 1 || child.tag.name != "br") {
                                if (options.format) applyFormat(child, options, outputChildren, indent);
                                outputChildren = outputChildren.concat(render(child, options));
                            }
                        }
                    }
                    options.formatIndent--;

                    if (outputChildren.length > 0) {
                        if (options.format && outputChildren[0] != "\n") applyFormat(element, options, output, indent);
                        output = output.concat(outputChildren);
                        empty = false;
                    }
                }

                if (!element.isRoot && renderTag) {
                    // render the closing tag
                    if (options.format) applyFormat(element, options, output, indent - 1);
                    output.push("</");
                    output.push(element.tag.name);
                    output.push(">");
                }
            }

            // check for empty tags
            if (!element.tag.allowEmpty && empty) { return []; }
        }

        return output;
    }

    // find a matching tag, and pop to it, if not do nothing
    function popToTagName(stack, tagNameArray) {
        return pop(
            stack,
            function (element) {
                return $.inArray(element.tag.nameOriginal, tagNameArray) > -1;
            });
    }

    function popToContainer(stack) {
        return pop(
            stack,
            function (element) {
                return element.isRoot || !element.tag.isInline;
            });
    }

    function pop(stack, test, index) {
        index = index || 1;
        var element = stack[stack.length - index];
        if (test(element)) {
            return true;
        } else if (stack.length - index > 0
                && pop(stack, test, index + 1)) {
            stack.pop();
            return true;
        }
        return false;
    }

    // Element Object
    function Element(tag) {
        if (tag) {
            this.tag = tag;
            this.isRoot = false;
        } else {
            this.tag = new Tag("root");
            this.isRoot = true;
        }
        this.attributes = [];
        this.children = [];

        this.hasAttribute = function (name) {
            for (var i = 0; i < this.attributes.length; i++) {
                if (this.attributes[i].name == name) return true;
            }
            return false;
        };

        this.childrenToString = function () {
            return this.children.join("");
        };

        return this;
    }

    // Attribute Object
    function Attribute(name, value) {
        this.name = name;
        this.value = value;

        return this;
    }

    // Tag object
    function Tag(name, close, rawAttributes, options) {
        this.name = name.toLowerCase();
        this.nameOriginal = this.name;
        this.render = true;

        this.init = function () {
            if (this.name == "--") {
                this.isComment = true;
                this.isSelfClosing = true;
                this.format = true;
            } else {
                this.isComment = false;
                this.isSelfClosing = $.inArray(this.name, tagSelfClosing) > -1;
                this.isNonClosing = $.inArray(this.name, tagNonClosing) > -1;
                this.isClosing = (close != undefined && close.length > 0);

                this.isInline = $.inArray(this.name, tagInline) > -1;
                this.disallowNest = $.inArray(this.name, tagDisallowNest) > -1;
                this.requiredParent = tagRequiredParent[$.inArray(this.name, tagRequiredParent) + 1];
                this.allowEmpty = options && $.inArray(this.name, options.allowEmpty) > -1;

                this.toProtect = $.inArray(this.name, tagProtect) > -1;

                this.format = $.inArray(this.name, tagFormat) > -1 || !this.isInline;
            }
            this.rawAttributes = rawAttributes;
            this.requiredAttributes = tagAttributesRequired[$.inArray(this.name, tagAttributesRequired) + 1];

            if (options) {
                if (!options.tagAttributesCache) options.tagAttributesCache = [];
                if ($.inArray(this.name, options.tagAttributesCache) == -1) {
                    var cacheItem = tagAttributes[$.inArray(this.name, tagAttributes) + 1].slice(0);

                    // add extra ones from options
                    for (var i = 0; i < options.allowedAttributes.length; i++) {
                        var attrName = options.allowedAttributes[i][0];
                        if ((
                            options.allowedAttributes[i].length == 1
                                || $.inArray(this.name, options.allowedAttributes[i][1]) > -1
                        ) && $.inArray(attrName, cacheItem) == -1) {
                            cacheItem.push(attrName);
                        }
                    }

                    options.tagAttributesCache.push(this.name);
                    options.tagAttributesCache.push(cacheItem);
                }

                this.allowedAttributes = options.tagAttributesCache[$.inArray(this.name, options.tagAttributesCache) + 1];
            }
        };

        this.init();

        this.rename = function (newName) {
            this.name = newName;
            this.init();
        };

        return this;
    }

    function startsWithWhitespace(item) {
        while (isElement(item) && item.children.length > 0) {
            item = item.children[0];
        }
        if (!isText(item)) return false;
        var text = textClean(item);
        return text.length > 0 && $.htmlClean.isWhitespace(text.charAt(0));
    }
    function endsWithWhitespace(item) {
        while (isElement(item) && item.children.length > 0) {
            item = item.children[item.children.length - 1];
        }
        if (!isText(item)) return false;
        var text = textClean(item);
        return text.length > 0 && $.htmlClean.isWhitespace(text.charAt(text.length - 1));
    }
    function isText(item) { return item.constructor == String; }
    function isInline(item) { return isText(item) || item.tag.isInline; }
    function isElement(item) { return item.constructor == Element; }
    function textClean(text) {
        return text
            .replace(/&nbsp;|\n/g, " ")
            .replace(/\s\s+/g, " ");
    }

    // trim off white space, doesn't use regex
    $.htmlClean.trim = function (text) {
        return $.htmlClean.trimStart($.htmlClean.trimEnd(text));
    };
    $.htmlClean.trimStart = function (text) {
        return text.substring($.htmlClean.trimStartIndex(text));
    };
    $.htmlClean.trimStartIndex = function (text) {
        for (var start = 0; start < text.length - 1 && $.htmlClean.isWhitespace(text.charAt(start)); start++);
        return start;
    };
    $.htmlClean.trimEnd = function (text) {
        return text.substring(0, $.htmlClean.trimEndIndex(text));
    };
    $.htmlClean.trimEndIndex = function (text) {
        for (var end = text.length - 1; end >= 0 && $.htmlClean.isWhitespace(text.charAt(end)); end--);
        return end + 1;
    };
    // checks a char is white space or not
    $.htmlClean.isWhitespace = function (c) { return $.inArray(c, whitespace) != -1; };

    // tags which are inline
    var tagInline = [
        "a", "abbr", "acronym", "address", "b", "big", "br", "button",
        "caption", "cite", "code", "del", "em", "font",
        "hr", "i", "input", "img", "ins", "label", "legend", "map", "q",
        "s", "samp", "select", "option", "param", "small", "span", "strike", "strong", "sub", "sup",
        "tt", "u", "var"];
    var tagFormat = ["address", "button", "caption", "code", "input", "label", "legend", "select", "option", "param"];
    var tagDisallowNest = ["h1", "h2", "h3", "h4", "h5", "h6", "p", "th", "td", "object"];
    var tagAllowEmpty = ["th", "td"];
    var tagRequiredParent = [
        null,
        "li", ["ul", "ol"],
        "dt", ["dl"],
        "dd", ["dl"],
        "td", ["tr"],
        "th", ["tr"],
        "tr", ["table", "thead", "tbody", "tfoot"],
        "thead", ["table"],
        "tbody", ["table"],
        "tfoot", ["table"],
        "param", ["object"]
        ];
    var tagProtect = ["script", "style", "pre", "code"];
    // tags which self close e.g. <br />
    var tagSelfClosing = ["area", "base", "br", "col", "command", "embed", "hr", "img", "input", "keygen", "link", "meta", "param", "source", "track", "wbr"];
    // tags which do not close
    var tagNonClosing = ["!doctype", "?xml"];
    // attributes allowed on tags
    var tagAttributes = [
            ["class"],  // default, for all tags not mentioned
            "?xml", [],
            "!doctype", [],
            "a", ["accesskey", "class", "href", "name", "title", "rel", "rev", "type", "tabindex"],
            "abbr", ["class", "title"],
            "acronym", ["class", "title"],
            "blockquote", ["cite", "class"],
            "button", ["class", "disabled", "name", "type", "value"],
            "del", ["cite", "class", "datetime"],
            "form", ["accept", "action", "class", "enctype", "method", "name"],
            "iframe", ["class", "height", "name", "sandbox", "seamless", "src", "srcdoc", "width"],
            "input", ["accept", "accesskey", "alt", "checked", "class", "disabled", "ismap", "maxlength", "name", "size", "readonly", "src", "tabindex", "type", "usemap", "value"],
            "img", ["alt", "class", "height", "src", "width"],
            "ins", ["cite", "class", "datetime"],
            "label", ["accesskey", "class", "for"],
            "legend", ["accesskey", "class"],
            "link", ["href", "rel", "type"],
            "meta", ["content", "http-equiv", "name", "scheme", "charset"],
            "map", ["name"],
            "optgroup", ["class", "disabled", "label"],
            "option", ["class", "disabled", "label", "selected", "value"],
            "q", ["class", "cite"],
            "script", ["src", "type"],
            "select", ["class", "disabled", "multiple", "name", "size", "tabindex"],
            "style", ["type"],
            "table", ["class", "summary"],
            "th", ["class", "colspan", "rowspan"],
            "td", ["class", "colspan", "rowspan"],
            "textarea", ["accesskey", "class", "cols", "disabled", "name", "readonly", "rows", "tabindex"],
            "param", ["name", "value"],
            "embed", ["height", "src", "type", "width"]
        ];
    var tagAttributesRequired = [[], "img", ["alt"]];
    // white space chars
    var whitespace = [" ", " ", "\t", "\n", "\r", "\f"];

})(jQuery);

if (typeof module !== 'undefined'){module.exports = ()=>(function ($) {
    $.fn.htmlClean = function (options) {
        // iterate and html clean each matched element
        return this.each(function () {
            if (this.value) {
                this.value = $.htmlClean(this.value, options);
            } else {
                this.innerHTML = $.htmlClean(this.innerHTML, options);
            }
        });
    };

    // clean the passed html
    $.htmlClean = function (html, options) {
        options = $.extend({}, $.htmlClean.defaults, options);
        options.allowEmpty = tagAllowEmpty.concat(options.allowEmpty);

        var tagsRE = /(<(\/)?(\w+:)?([\w]+)([^>]*)>)|<!--(.*?--)>/gi;
        var attrsRE = /([\w\-]+)\s*=\s*(".*?"|'.*?'|[^\s>\/]*)/gi;

        var tagMatch;
        var root = new Element();
        var stack = [root];
        var container = root;

        if (options.bodyOnly) {
            // check for body tag
            if (tagMatch = /<body[^>]*>((\n|.)*)<\/body>/i.exec(html)) {
                html = tagMatch[1];
            }
        }
        html = html.concat("<xxx>"); // ensure last element/text is found
        var lastIndex;

        while (tagMatch = tagsRE.exec(html)) {
            var tag = tagMatch[6]
                ? new Tag("--", null, tagMatch[6], options)
                : new Tag(tagMatch[4], tagMatch[2], tagMatch[5], options);

            // add the text
            var text = html.substring(lastIndex, tagMatch.index);
            if (text.length > 0) {
                var child = container.children[container.children.length - 1];
                if (container.children.length > 0
                        && isText(child = container.children[container.children.length - 1])) {
                    // merge text
                    container.children[container.children.length - 1] = child.concat(text);
                } else {
                    container.children.push(text);
                }
            }
            lastIndex = tagsRE.lastIndex;

            if (tag.isClosing) {
                // find matching container
                if (popToTagName(stack, [tag.name])) {
                    stack.pop();
                    container = stack[stack.length - 1];
                }
            } else {
                // create a new element
                var element = new Element(tag);

                // add attributes
                var attrMatch;
                while (attrMatch = attrsRE.exec(tag.rawAttributes)) {

                    // check style attribute and do replacements
                    if (attrMatch[1].toLowerCase() == "style"
                        && options.replaceStyles) {

                        var renderParent = !tag.isInline;
                        for (var i = 0; i < options.replaceStyles.length; i++) {
                            if (options.replaceStyles[i][0].test(attrMatch[2])) {

                                if (!renderParent) {
                                    tag.render = false;
                                    renderParent = true;
                                }
                                container.children.push(element); // assumes not replaced
                                stack.push(element);
                                container = element; // assumes replacement is a container
                                // create new tag and element
                                tag = new Tag(options.replaceStyles[i][1], "", "", options);
                                element = new Element(tag);
                            }
                        }
                    }

                    if (tag.allowedAttributes != null
                            && (tag.allowedAttributes.length == 0
                            || $.inArray(attrMatch[1], tag.allowedAttributes) > -1)) {
                        element.attributes.push(new Attribute(attrMatch[1], attrMatch[2]));
                    }
                }
                // add required empty ones
                $.each(tag.requiredAttributes, function () {
                    var name = this.toString();
                    if (!element.hasAttribute(name)) element.attributes.push(new Attribute(name, ""));
                });

                // check for replacements
                for (var repIndex = 0; repIndex < options.replace.length; repIndex++) {
                    for (var tagIndex = 0; tagIndex < options.replace[repIndex][0].length; tagIndex++) {
                        var byName = typeof (options.replace[repIndex][0][tagIndex]) == "string";
                        if ((byName && options.replace[repIndex][0][tagIndex] == tag.name)
                                || (!byName && options.replace[repIndex][0][tagIndex].test(tagMatch))) {

                            // set the name to the replacement
                            tag.rename(options.replace[repIndex][1]);

                            repIndex = options.replace.length; // break out of both loops
                            break;
                        }
                    }
                }

                // check container rules
                var add = true;
                if (!container.isRoot) {
                    if (container.tag.isInline && !tag.isInline) {
                        if (add = popToContainer(stack)) {
                            container = stack[stack.length - 1];
                        }
                    } else if (container.tag.disallowNest && tag.disallowNest
                                && !tag.requiredParent) {
                        add = false;
                    } else if (tag.requiredParent) {
                        if (add = popToTagName(stack, tag.requiredParent)) {
                            container = stack[stack.length - 1];
                        }
                    }
                }

                if (add) {
                    container.children.push(element);

                    if (tag.toProtect) {
                        // skip to closing tag
                        var tagMatch2;
                        while (tagMatch2 = tagsRE.exec(html)) {
                            var tag2 = new Tag(tagMatch2[4], tagMatch2[1], tagMatch2[5], options);
                            if (tag2.isClosing && tag2.name == tag.name) {
                                element.children.push(RegExp.leftContext.substring(lastIndex));
                                lastIndex = tagsRE.lastIndex;
                                break;
                            }
                        }
                    } else {
                        // set as current container element
                        if (!tag.isSelfClosing && !tag.isNonClosing) {
                            stack.push(element);
                            container = element;
                        }
                    }
                }
            }
        }

        // render doc
        return $.htmlClean.trim(render(root, options).join(""));
    };

    // defaults
    $.htmlClean.defaults = {
        // only clean the body tagbody
        bodyOnly: true,
        // only allow tags in this array, (white list), contents still rendered
        allowedTags: [],
        // remove tags in this array, (black list), contents still rendered
        removeTags: ["basefont", "center", "dir", "font", "frame", "frameset", "iframe", "isindex", "menu", "noframes", "s", "strike", "u"],
        // array of [attributeName], [optional array of allowed on elements] e.g. [["id"], ["style", ["p", "dl"]]] // allow all elements to have id and allow style on 'p' and 'dl'
        allowedAttributes: [],
        // array of attribute names to remove on all elements in addition to those not in tagAttributes e.g ["width", "height"]
        removeAttrs: [],
        // array of [className], [optional array of allowed on elements] e.g. [["aClass"], ["anotherClass", ["p", "dl"]]]
        allowedClasses: [],
        // format the result
        format: false,
        // format indent to start on
        formatIndent: 0,
        // tags to replace, and what to replace with, tag name or regex to match the tag and attributes 
        replace: [
            [["b", "big"], "strong"],
            [["i"], "em"]
        ],
        // styles to replace with tags, multiple style matches supported, inline tags are replaced by the first match blocks are retained
        replaceStyles: [
            [/font-weight:\s*bold/i, "strong"],
            [/font-style:\s*italic/i, "em"],
            [/vertical-align:\s*super/i, "sup"],
            [/vertical-align:\s*sub/i, "sub"]
        ],
        allowComments: false,
        allowEmpty: []
    };

    function applyFormat(element, options, output, indent) {
        if (element.tag.format && output.length > 0) {
            output.push("\n");
            for (var i = 0; i < indent; i++) output.push("\t");
        }
    }

    function render(element, options) {
        var output = [], empty = element.attributes.length == 0, indent = 0;

        if (element.tag.isComment) {
            if (options.allowComments) {
                output.push("<!--");
                output.push(element.tag.rawAttributes);
                output.push(">");

                if (options.format) applyFormat(element, options, output, indent - 1);
            }
        } else {

            // don't render if not in allowedTags or in removeTags
            var renderTag
                = element.tag.render
                    && (options.allowedTags.length == 0 || $.inArray(element.tag.name, options.allowedTags) > -1)
                    && (options.removeTags.length == 0 || $.inArray(element.tag.name, options.removeTags) == -1);

            if (!element.isRoot && renderTag) {

                // render opening tag
                output.push("<");
                output.push(element.tag.name);
                $.each(element.attributes, function () {
                    if ($.inArray(this.name, options.removeAttrs) == -1) {
                        var m = RegExp(/^(['"]?)(.*?)['"]?$/).exec(this.value);
                        var value = m[2];
                        var valueQuote = m[1] || "'";

                        // check for classes allowed                    
                        if (this.name == "class" && options.allowedClasses.length > 0) {
                            value =
                            $.grep(value.split(" "), function (c) {
                                return $.grep(options.allowedClasses, function (a) {
                                    return a == c
                                        || (a[0] == c && (a.length == 1 || $.inArray(element.tag.name, a[1]) > -1));
                                }).length > 0;
                            })
                            .join(" ");
                        }

                        if (value != null && (value.length > 0 || $.inArray(this.name, element.tag.requiredAttributes) > -1)) {
                            output.push(" ");
                            output.push(this.name);
                            output.push("=");
                            output.push(valueQuote);
                            output.push(value);
                            output.push(valueQuote);
                        }
                    }
                });
            }

            if (element.tag.isSelfClosing) {
                // self closing 
                if (renderTag) output.push(" />");
                empty = false;
            } else if (element.tag.isNonClosing) {
                empty = false;
            } else {
                if (!element.isRoot && renderTag) {
                    // close
                    output.push(">");
                }

                indent = options.formatIndent++;

                // render children
                if (element.tag.toProtect) {
                    outputChildren = $.htmlClean.trim(element.children.join("")).replace(/<br>/ig, "\n");
                    output.push(outputChildren);
                    empty = outputChildren.length == 0;
                } else {
                    var outputChildren = [];
                    for (var i = 0; i < element.children.length; i++) {
                        var child = element.children[i];
                        var text = $.htmlClean.trim(textClean(isText(child) ? child : child.childrenToString()));
                        if (isInline(child)) {
                            if (i > 0 && text.length > 0
                        && (startsWithWhitespace(child) || endsWithWhitespace(element.children[i - 1]))) {
                                outputChildren.push(" ");
                            }
                        }
                        if (isText(child)) {
                            if (text.length > 0) {
                                outputChildren.push(text);
                            }
                        } else {
                            // don't allow a break to be the last child
                            if (i != element.children.length - 1 || child.tag.name != "br") {
                                if (options.format) applyFormat(child, options, outputChildren, indent);
                                outputChildren = outputChildren.concat(render(child, options));
                            }
                        }
                    }
                    options.formatIndent--;

                    if (outputChildren.length > 0) {
                        if (options.format && outputChildren[0] != "\n") applyFormat(element, options, output, indent);
                        output = output.concat(outputChildren);
                        empty = false;
                    }
                }

                if (!element.isRoot && renderTag) {
                    // render the closing tag
                    if (options.format) applyFormat(element, options, output, indent - 1);
                    output.push("</");
                    output.push(element.tag.name);
                    output.push(">");
                }
            }

            // check for empty tags
            if (!element.tag.allowEmpty && empty) { return []; }
        }

        return output;
    }

    // find a matching tag, and pop to it, if not do nothing
    function popToTagName(stack, tagNameArray) {
        return pop(
            stack,
            function (element) {
                return $.inArray(element.tag.nameOriginal, tagNameArray) > -1;
            });
    }

    function popToContainer(stack) {
        return pop(
            stack,
            function (element) {
                return element.isRoot || !element.tag.isInline;
            });
    }

    function pop(stack, test, index) {
        index = index || 1;
        var element = stack[stack.length - index];
        if (test(element)) {
            return true;
        } else if (stack.length - index > 0
                && pop(stack, test, index + 1)) {
            stack.pop();
            return true;
        }
        return false;
    }

    // Element Object
    function Element(tag) {
        if (tag) {
            this.tag = tag;
            this.isRoot = false;
        } else {
            this.tag = new Tag("root");
            this.isRoot = true;
        }
        this.attributes = [];
        this.children = [];

        this.hasAttribute = function (name) {
            for (var i = 0; i < this.attributes.length; i++) {
                if (this.attributes[i].name == name) return true;
            }
            return false;
        };

        this.childrenToString = function () {
            return this.children.join("");
        };

        return this;
    }

    // Attribute Object
    function Attribute(name, value) {
        this.name = name;
        this.value = value;

        return this;
    }

    // Tag object
    function Tag(name, close, rawAttributes, options) {
        this.name = name.toLowerCase();
        this.nameOriginal = this.name;
        this.render = true;

        this.init = function () {
            if (this.name == "--") {
                this.isComment = true;
                this.isSelfClosing = true;
                this.format = true;
            } else {
                this.isComment = false;
                this.isSelfClosing = $.inArray(this.name, tagSelfClosing) > -1;
                this.isNonClosing = $.inArray(this.name, tagNonClosing) > -1;
                this.isClosing = (close != undefined && close.length > 0);

                this.isInline = $.inArray(this.name, tagInline) > -1;
                this.disallowNest = $.inArray(this.name, tagDisallowNest) > -1;
                this.requiredParent = tagRequiredParent[$.inArray(this.name, tagRequiredParent) + 1];
                this.allowEmpty = options && $.inArray(this.name, options.allowEmpty) > -1;

                this.toProtect = $.inArray(this.name, tagProtect) > -1;

                this.format = $.inArray(this.name, tagFormat) > -1 || !this.isInline;
            }
            this.rawAttributes = rawAttributes;
            this.requiredAttributes = tagAttributesRequired[$.inArray(this.name, tagAttributesRequired) + 1];

            if (options) {
                if (!options.tagAttributesCache) options.tagAttributesCache = [];
                if ($.inArray(this.name, options.tagAttributesCache) == -1) {
                    var cacheItem = tagAttributes[$.inArray(this.name, tagAttributes) + 1].slice(0);

                    // add extra ones from options
                    for (var i = 0; i < options.allowedAttributes.length; i++) {
                        var attrName = options.allowedAttributes[i][0];
                        if ((
                            options.allowedAttributes[i].length == 1
                                || $.inArray(this.name, options.allowedAttributes[i][1]) > -1
                        ) && $.inArray(attrName, cacheItem) == -1) {
                            cacheItem.push(attrName);
                        }
                    }

                    options.tagAttributesCache.push(this.name);
                    options.tagAttributesCache.push(cacheItem);
                }

                this.allowedAttributes = options.tagAttributesCache[$.inArray(this.name, options.tagAttributesCache) + 1];
            }
        };

        this.init();

        this.rename = function (newName) {
            this.name = newName;
            this.init();
        };

        return this;
    }

    function startsWithWhitespace(item) {
        while (isElement(item) && item.children.length > 0) {
            item = item.children[0];
        }
        if (!isText(item)) return false;
        var text = textClean(item);
        return text.length > 0 && $.htmlClean.isWhitespace(text.charAt(0));
    }
    function endsWithWhitespace(item) {
        while (isElement(item) && item.children.length > 0) {
            item = item.children[item.children.length - 1];
        }
        if (!isText(item)) return false;
        var text = textClean(item);
        return text.length > 0 && $.htmlClean.isWhitespace(text.charAt(text.length - 1));
    }
    function isText(item) { return item.constructor == String; }
    function isInline(item) { return isText(item) || item.tag.isInline; }
    function isElement(item) { return item.constructor == Element; }
    function textClean(text) {
        return text
            .replace(/&nbsp;|\n/g, " ")
            .replace(/\s\s+/g, " ");
    }

    // trim off white space, doesn't use regex
    $.htmlClean.trim = function (text) {
        return $.htmlClean.trimStart($.htmlClean.trimEnd(text));
    };
    $.htmlClean.trimStart = function (text) {
        return text.substring($.htmlClean.trimStartIndex(text));
    };
    $.htmlClean.trimStartIndex = function (text) {
        for (var start = 0; start < text.length - 1 && $.htmlClean.isWhitespace(text.charAt(start)); start++);
        return start;
    };
    $.htmlClean.trimEnd = function (text) {
        return text.substring(0, $.htmlClean.trimEndIndex(text));
    };
    $.htmlClean.trimEndIndex = function (text) {
        for (var end = text.length - 1; end >= 0 && $.htmlClean.isWhitespace(text.charAt(end)); end--);
        return end + 1;
    };
    // checks a char is white space or not
    $.htmlClean.isWhitespace = function (c) { return $.inArray(c, whitespace) != -1; };

    // tags which are inline
    var tagInline = [
        "a", "abbr", "acronym", "address", "b", "big", "br", "button",
        "caption", "cite", "code", "del", "em", "font",
        "hr", "i", "input", "img", "ins", "label", "legend", "map", "q",
        "s", "samp", "select", "option", "param", "small", "span", "strike", "strong", "sub", "sup",
        "tt", "u", "var"];
    var tagFormat = ["address", "button", "caption", "code", "input", "label", "legend", "select", "option", "param"];
    var tagDisallowNest = ["h1", "h2", "h3", "h4", "h5", "h6", "p", "th", "td", "object"];
    var tagAllowEmpty = ["th", "td"];
    var tagRequiredParent = [
        null,
        "li", ["ul", "ol"],
        "dt", ["dl"],
        "dd", ["dl"],
        "td", ["tr"],
        "th", ["tr"],
        "tr", ["table", "thead", "tbody", "tfoot"],
        "thead", ["table"],
        "tbody", ["table"],
        "tfoot", ["table"],
        "param", ["object"]
        ];
    var tagProtect = ["script", "style", "pre", "code"];
    // tags which self close e.g. <br />
    var tagSelfClosing = ["area", "base", "br", "col", "command", "embed", "hr", "img", "input", "keygen", "link", "meta", "param", "source", "track", "wbr"];
    // tags which do not close
    var tagNonClosing = ["!doctype", "?xml"];
    // attributes allowed on tags
    var tagAttributes = [
            ["class"],  // default, for all tags not mentioned
            "?xml", [],
            "!doctype", [],
            "a", ["accesskey", "class", "href", "name", "title", "rel", "rev", "type", "tabindex"],
            "abbr", ["class", "title"],
            "acronym", ["class", "title"],
            "blockquote", ["cite", "class"],
            "button", ["class", "disabled", "name", "type", "value"],
            "del", ["cite", "class", "datetime"],
            "form", ["accept", "action", "class", "enctype", "method", "name"],
            "iframe", ["class", "height", "name", "sandbox", "seamless", "src", "srcdoc", "width"],
            "input", ["accept", "accesskey", "alt", "checked", "class", "disabled", "ismap", "maxlength", "name", "size", "readonly", "src", "tabindex", "type", "usemap", "value"],
            "img", ["alt", "class", "height", "src", "width"],
            "ins", ["cite", "class", "datetime"],
            "label", ["accesskey", "class", "for"],
            "legend", ["accesskey", "class"],
            "link", ["href", "rel", "type"],
            "meta", ["content", "http-equiv", "name", "scheme", "charset"],
            "map", ["name"],
            "optgroup", ["class", "disabled", "label"],
            "option", ["class", "disabled", "label", "selected", "value"],
            "q", ["class", "cite"],
            "script", ["src", "type"],
            "select", ["class", "disabled", "multiple", "name", "size", "tabindex"],
            "style", ["type"],
            "table", ["class", "summary"],
            "th", ["class", "colspan", "rowspan"],
            "td", ["class", "colspan", "rowspan"],
            "textarea", ["accesskey", "class", "cols", "disabled", "name", "readonly", "rows", "tabindex"],
            "param", ["name", "value"],
            "embed", ["height", "src", "type", "width"]
        ];
    var tagAttributesRequired = [[], "img", ["alt"]];
    // white space chars
    var whitespace = [" ", " ", "\t", "\n", "\r", "\f"];

})(jQuery);
};