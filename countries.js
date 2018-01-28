const cheerio = require("cheerio");
const express = require("express");
const request = require("request");
const { URL } = require("url");

const settings = require("./get-settings");
const listUrl = new URL("/countries/pages/list.aspx", settings.baseURL);

const app = express();

// country.js responsible for requests for specific countries
// e.g. http://localhost/countries/australia
const country = require("./country");
app.use("/", country);

// Need to get normalized country titles from DFAT
app.on("mount", () => {
    request(listUrl.toString(), (error, response, body) => {
        if (error || response.statusCode !== 200) {
            throw new Error(`Unable to access ${listUrl.toString()}`);
        }

        const countriesList = parseBody(body);
        settings.countries = countriesList.map(x => ({ normalizedTitle: x.NormalizedTitle, url: x.URL }));
    });
});

// Responsible for returning all countries
// e.g. http://localhost/countries/
app.get("/", (req, res) => {
    request(listUrl.toString(), (error, response, body) => {
        if (error || response.statusCode !== 200) {
            return res.status(503).json({ error: `Unable to access ${listUrl.toString()}` });
        }

        const countriesList = parseBody(body);
        res.json(countriesList);
        settings.countries = countriesList.map(x => ({ normalizedTitle: x.NormalizedTitle, url: x.URL }));
    });
});

function parseBody(body) {
    const $ = cheerio.load(body);
    const selection = $(".content__main", "#rs_read_this").children().last().html();
    if (!selection) {
        throw new Error(`Could not make selection from ${listUrl.toString()}`);
    }

    const arrayStart = selection.indexOf("[");
    const arrayEnd = selection.lastIndexOf("]");
    if (arrayStart < 0 || arrayEnd < 1) {
        throw new Error(`${listUrl.toString()} did not contain JSON of countries`);
    }
  
    try {
        var countries = JSON.parse(selection.substring(arrayStart, arrayEnd + 1));
    }
    catch (e) {
        throw new Error(`${listUrl.toString()} JSON of countries could not be parsed due to ${e.name}:${e.message}`);
    }
  
    if (!Array.isArray(countries) || countries.length < 1) {
        throw new Error(`${listUrl.toString()} JSON of countries was empty`);
    }
  
    for (let i = countries.length - 1; i >= 0; i--) {
        if (countries[i].FileRef) {
            try {
                parseCountry(countries[i]);
            }
            catch (e) {
                countries.splice(i, 1);
            }
        }
        else {
            countries.splice(i, 1);
        }
    }

    return countries;
}

function parseCountry(country) {
    const beforeTitle = country.FileRef.lastIndexOf("/");
    const afterTitle = country.FileRef.lastIndexOf(".");
    if (beforeTitle < 0 || afterTitle < 1) {
        throw new Error(`${country.FileRef} did not contain normalized title`);
    }

    country.NormalizedTitle = country.FileRef.substring(beforeTitle + 1, afterTitle);
  
    const beforeUrl = country.FileRef.indexOf(";#");
    if (beforeUrl < 0) {
        throw new Error(`${country.FileRef} did not contain URL`);
    }

    country.URL = (new URL(country.FileRef.substring(beforeUrl + 2), settings.baseURL)).toString();
  
    if (country.ArticleStartDate) {
        // DFAT source has dates in Microsoft JSON format, e.g. ArticleStartDate: "/Date(1513308166000)/"
        const timestamp = parseInt(country.ArticleStartDate.substring(6), 10);
        country.LastModified = Number.isInteger(timestamp) ? new Date(timestamp) : new Date();
    }
    else {
        country.LastModified = new Date();
    }
  
    try {
        var levels = JSON.parse(country.Smartraveller_x0020_Advice_x0020_Levels);
    }
    catch (e) {
        throw new Error(`${country.FileRef} advice levels not parsed due to ${e.name}:${e.message}`);
    }

    if (levels && levels.isTA) {
        country.AdviceIssued = true;
        country.Advice = Array.isArray(levels.items) ? levels.items : []; 
    }
    else {
        country.AdviceIssued = false;
        country.Advice = [];
    }

    delete country.FileRef;
    delete country.ContentType;
    delete country.ArticleStartDate;
    delete country.Smartraveller_x0020_Advice_x0020_Levels;
}

module.exports = app;