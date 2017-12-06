const d3 = require('d3');
const Tabletop = require('tabletop');
const _ = {
    map: require('lodash/map'),
    uniqBy: require('lodash/uniqBy'),
    capitalize: require('lodash/capitalize'),
    each: require('lodash/each')
};

const InputSanitizer = require('./inputSanitizer');
const Radar = require('../models/radar');
const Quadrant = require('../models/quadrant');
const Ring = require('../models/ring');
const Blip = require('../models/blip');
const GraphingRadar = require('../graphing/radar');
const MalformedDataError = require('../exceptions/malformedDataError');
const SheetNotFoundError = require('../exceptions/sheetNotFoundError');
const ContentValidator = require('./contentValidator');
const Sheet = require('./sheet');
const ExceptionMessages = require('./exceptionMessages');
const fetch = require('node-fetch');

const plotRadar = function (title, blips) {
    document.title = title;
    d3.selectAll(".loading").remove();

    var rings = _.map(_.uniqBy(blips, 'ring'), 'ring');
    var ringMap = {};
    var maxRings = 4;

    _.each(rings, function (ringName, i) { 
        if (i == maxRings) {
            throw new MalformedDataError(ExceptionMessages.TOO_MANY_RINGS);
        }
        ringMap[ringName] = new Ring(ringName, i);
    });

    var quadrants = {};
    _.each(blips, function (blip) {
        if (!quadrants[blip.quadrant]) {
            quadrants[blip.quadrant] = new Quadrant(_.capitalize(blip.quadrant));
        }
        quadrants[blip.quadrant].add(new Blip(blip.name, ringMap[blip.ring], blip.isNew.toLowerCase() === 'true', blip.topic, blip.description))
    });

    var radar = new Radar();
    _.each(quadrants, function (quadrant) {
        radar.addQuadrant(quadrant)
    });

    var size = (window.innerHeight - 133) < 620 ? 620 : window.innerHeight - 133;

    new GraphingRadar(size, radar).init().plot();
}

const GoogleSheet = function (sheetReference, sheetName) {
    var self = {};

    self.build = function () {
        var sheet = new Sheet(sheetReference);
        sheet.exists(function(notFound) {
            if (notFound) {
                plotErrorMessage(notFound);
                return;
            }

            Tabletop.init({
                key: sheet.id,
                callback: createBlips
            });
        });

        function createBlips(__, tabletop) {

            try {

                if (!sheetName) {
                    sheetName = tabletop.foundSheetNames[0];
                }
                var columnNames = tabletop.sheets(sheetName).columnNames;

                var contentValidator = new ContentValidator(columnNames);
                contentValidator.verifyContent();
                contentValidator.verifyHeaders();

                var all = tabletop.sheets(sheetName).all();
                var blips = _.map(all, new InputSanitizer().sanitize);

                plotRadar(tabletop.googleSheetName, blips);
            } catch (exception) {
                plotErrorMessage(exception);
            }
        }
    };

    self.init = function () {
        plotLoading();
        return self;
    };

    return self;
};

const CSVDocument = function (url) {
    var self = {};

    self.build = function () {
        d3.csv(url, createBlips);
    }

    var createBlips = function (data) {
        try {
            var columnNames = data['columns'];
            delete data['columns'];
            var contentValidator = new ContentValidator(columnNames);
            contentValidator.verifyContent();
            contentValidator.verifyHeaders();
            var blips = _.map(data, new InputSanitizer().sanitize);
            plotRadar(FileName(url), blips);
        } catch (exception) {
            plotErrorMessage(exception);
        }
    }

    self.init = function () {
        plotLoading();
        return self;
    };

    return self;
};

const QueryParams = function (queryString) {
    var decode = function (s) {
        return decodeURIComponent(s.replace(/\+/g, " "));
    };

    var search = /([^&=]+)=?([^&]*)/g;

    var queryParams = {};
    var match;
    while (match = search.exec(queryString))
        queryParams[decode(match[1])] = decode(match[2]);

    return queryParams
};

const DomainName = function (url) {
    var search = /.+:\/\/([^\/]+)/;
    var match = search.exec(decodeURIComponent(url.replace(/\+/g, " ")));
    return match == null ? null : match[1];
}


const FileName = function (url) {
    var search = /([^\/]+)$/;
    var match = search.exec(decodeURIComponent(url.replace(/\+/g, " ")));
    if (match != null) {
        var str = match[1];
        return str;
    }
    return url;
}


const GoogleSheetInput = function () {
    var self = {};
    
    self.build = function () {
        var domainName = DomainName(window.location.search.substring(1));
        var queryParams = QueryParams(window.location.search.substring(1));

        if (domainName && queryParams.sheetId.endsWith('csv')) {
            var sheet = CSVDocument(queryParams.sheetId);
            sheet.init().build();
        }
        else if (domainName && domainName.endsWith('google.com') && queryParams.sheetId) {
            var sheet = GoogleSheet(queryParams.sheetId, queryParams.sheetName);
            console.log(queryParams.sheetName)

            sheet.init().build();
        } else {
            var content = d3.select('body')
                .append('div')
                .attr('class', 'input-sheet');

            set_document_title();

            plotLogo(content);

            var bannerText = '<div><h1><strong>Sierra Tech Radar</strong></h1><p>Showing the TIS group\'s view of the current technoology landscape </p></div>';

            plotBanner(content, bannerText);

            //plotForm(content);
            plotMenu(content);

            plotFooter(content);

        }
    };

    return self;
};

function set_document_title() {
    document.title = "Build your own Radar";
}

function plotLoading(content) {
    var content = d3.select('body')
        .append('div')
        .attr('class', 'loading')
        .append('div')
        .attr('class', 'input-sheet');

    set_document_title();

    plotLogo(content);

    var bannerText = '<h1>Building your radar...</h1><p>Your Technology Radar will be available in just a few seconds</p>';
    plotBanner(content, bannerText);
    plotFooter(content);
}

function plotLogo(content) {
    content.append('div')
        .attr('class', 'input-sheet__logo')
        .html('<a href="https://www.sierrasystems.com"><img src="/images/sierra-logo.png" / ></a>');
}

function plotFooter(content) {
    content
        .append('div')
        .attr('id', 'footer')
        .append('div')
        .attr('class', 'footer-content')
        .append('p')
        .html('This site is for Sierra Systems Group internal use only.'
        + 'The site is based upon the <a href="https://github.com/thoughtworks/build-your-own-radar">open source project</a> created by <a href="http://thoughtworks.com">ThoughtWorks </a>.');

}

function plotBanner(content, text) {
    content.append('div')
        .attr('class', 'input-sheet__banner')
        /*.append('q') */
        .html(text);

}

function plotForm(content) {
    content.append('div')
        .attr('class', 'input-sheet__form')
        .append('p')
        .html('<strong>Enter the URL of your published Google Sheet or CSV file below…</strong>');

    var form = content.select('.input-sheet__form').append('form')
        .attr('method', 'get');

    form.append('input')
        .attr('type', 'text')
        .attr('name', 'sheetId')
        .attr('placeholder', "e.g. https://docs.google.com/spreadsheets/d/<\sheetid\> or hosted CSV file")
        .attr('required','');

    form.append('button')
        .attr('type', 'submit')
        .append('a')
        .attr('class', 'button')
        .text('Build my radar');

    form.append('p').html('<a href="https://www.sierrasystems.com"><img src="/images/sierra-symbol.png" / ></a>');

}

function plotMenu(content) {

    content.append('div')
        .attr('class', 'radar-select')
        .append('p')
        .html('<strong>Select one of the following tech radar:</strong>');

    var list = content.select('.radar-select').append('ul');
    var url = window.location.origin + '/radar-config.json';

    fetch(url, { compress: false })
        .then(function(res) {
            return res.json();
        }).then(function(json) {
            for (var i = 0; i < json.radars.length; i++) {
                var radar = json.radars[i];

                var href = '?sheetId=' + encodeURIComponent(radar.gsheetUrl);
                if (radar.sheetName) {
                    href += '&sheetName=' + encodeURIComponent(item.sheetName);
                }

                list.append('li')
                    .append('a')
                    .attr('href', href)
                    .text(radar.name);
            }
        });

    content.select('.radar-select').append('p').html('<a href="https://www.sierrasystems.com"><img src="/images/sierra-symbol.png" /></a>');
}

function plotErrorMessage(exception) {
    d3.selectAll(".loading").remove();
    var message = 'Oops! It seems like there are some problems with loading your data. ';

    if (exception instanceof MalformedDataError) {
        message = message.concat(exception.message);
    } else if (exception instanceof SheetNotFoundError) {
        message = exception.message;
    } else {
        console.error(exception);
    }

    message = message.concat('<br/>', 'Please check <a href="https://info.thoughtworks.com/visualize-your-tech-strategy-guide.html#faq">FAQs</a> for possible solutions.');

    d3.select('body')
        .append('div')
        .attr('class', 'error-container')
        .append('div')
        .attr('class', 'error-container__message')
        .append('p')
        .html(message);
}

module.exports = GoogleSheetInput;
