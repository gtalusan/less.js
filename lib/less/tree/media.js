var Ruleset = require("./ruleset"),
    Value = require("./value"),
    Selector = require("./selector"),
    Anonymous = require("./anonymous"),
    Expression = require("./expression"),
    Directive = require("./directive");

var Media = function (value, features, index, currentFileInfo, visibilityInfo) {
    this.index = index;
    this.currentFileInfo = currentFileInfo;

    var selectors = (new Selector([], null, null, this.index, this.currentFileInfo)).createEmptySelectors();

    this.features = new Value(features);
    this.rules = [new Ruleset(selectors, value)];
    this.rules[0].allowImports = true;
    this.copyVisibilityInfo(visibilityInfo);
};
Media.prototype = new Directive();
Media.prototype.type = "Media";
Media.prototype.isRulesetLike = true;
Media.prototype.accept = function (visitor) {
    if (this.features) {
        this.features = visitor.visit(this.features);
    }
    if (this.rules) {
        this.rules = visitor.visitArray(this.rules);
    }
};
Media.prototype.genCSS = function (context, output) {
    output.add('@media ', this.currentFileInfo, this.index);
    this.features.genCSS(context, output);
    this.outputRuleset(context, output, this.rules);
};
Media.prototype.eval = function (context) {
    if (!context.mediaBlocks) {
        context.mediaBlocks = [];
        context.mediaPath = [];
    }

    var media = new Media(null, [], this.index, this.currentFileInfo, this.visibilityInfo());
    if (this.debugInfo) {
        this.rules[0].debugInfo = this.debugInfo;
        media.debugInfo = this.debugInfo;
    }
    var strictMathBypass = false;
    if (!context.strictMath) {
        strictMathBypass = true;
        context.strictMath = true;
    }
    try {
        media.features = this.features.eval(context);
    }
    finally {
        if (strictMathBypass) {
            context.strictMath = false;
        }
    }

    context.mediaPath.push(media);
    context.mediaBlocks.push(media);

    this.rules[0].functionRegistry = context.frames[0].functionRegistry.inherit();
    context.frames.unshift(this.rules[0]);
    media.rules = [this.rules[0].eval(context)];
    context.frames.shift();

    context.mediaPath.pop();

    return context.mediaPath.length === 0 ? media.evalTop(context) :
                media.evalNested(context);
};
Media.prototype.evalTop = function (context) {
    var result = this;

    // Render all dependent Media blocks.
    if (context.mediaBlocks.length > 1) {
        var selectors = (new Selector([], null, null, this.index, this.currentFileInfo)).createEmptySelectors();
        result = new Ruleset(selectors, context.mediaBlocks);
        result.multiMedia = true;
        result.copyVisibilityInfo(this.visibilityInfo());
    }

    delete context.mediaBlocks;
    delete context.mediaPath;

    return result;
};
Media.prototype.evalNested = function (context) {
    var i, value,
        path = context.mediaPath.concat([this]);

    // Extract the media-query conditions separated with `,` (OR).
    for (i = 0; i < path.length; i++) {
        value = path[i].features instanceof Value ?
                    path[i].features.value : path[i].features;
        path[i] = Array.isArray(value) ? value : [value];
    }

    // Trace all permutations to generate the resulting media-query.
    //
    // (a, b and c) with nested (d, e) ->
    //    a and d
    //    a and e
    //    b and c and d
    //    b and c and e
    this.features = new Value(this.permute(path).map(function (path) {
        path = path.map(function (fragment) {
            return fragment.toCSS ? fragment : new Anonymous(fragment);
        });

        for (i = path.length - 1; i > 0; i--) {
            path.splice(i, 0, new Anonymous("and"));
        }

        return new Expression(path);
    }));

    // Fake a tree-node that doesn't output anything.
    return new Ruleset([], []);
};
Media.prototype.permute = function (arr) {
    if (arr.length === 0) {
        return [];
    } else if (arr.length === 1) {
        return arr[0];
    } else {
        var result = [];
        var rest = this.permute(arr.slice(1));
        for (var i = 0; i < rest.length; i++) {
            for (var j = 0; j < arr[0].length; j++) {
                result.push([arr[0][j]].concat(rest[i]));
            }
        }
        return result;
    }
};
Media.prototype.bubbleSelectors = function (selectors) {
    if (!selectors) {
        return;
    }
    this.rules = [new Ruleset(selectors.slice(0), [this.rules[0]])];
};
module.exports = Media;
