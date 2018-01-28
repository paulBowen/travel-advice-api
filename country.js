const cheerio = require("cheerio");
const express = require("express");
const request = require("request");
const { URL } = require("url");

const settings = require("./get-settings");

const router = express.Router();

router.get("/:title/map", (req, res) => {
    // Redirect to DFAT for simplicity (country image does not need processing, unlike country info)

    // All but The Bahamas' maps can be found at http://smartraveller.gov.au/Maps/{NormalizedTitle}.gif
    // It would be more reliable to parse the country info page to find the image URL
    // but hard-coding the URL below avoids that extra request to DFAT

    if (req.params.title === "bahamas") {
        res.redirect(new URL("/Maps/The_Bahamas.gif", settings.baseURL));
    }
    else {
        res.redirect(new URL(`/Maps/${req.params.title}.gif`, settings.baseURL));
    }
});

router.get("/:title", (req, res) => {
    let cachedCountry = settings.countries.find(x => (x.normalizedTitle === req.params.title));

    if (!cachedCountry) {
        cachedCountry = settings.countries.find(x => (x.normalizedTitle === req.params.title.replace(/ /g, "_")));
    }

    if (!cachedCountry) {
        return res.status(404).json({ error: "Country not found" });
    }

    request(cachedCountry.url, (error, response, body) => {
        if (error || response.statusCode !== 200) {
            return res.status(503).json({ error: `Unable to access ${cachedCountry.url}` });
        }

        try {
            var country = parseBody(cachedCountry, body);
        }
        catch (e) {
            console.error(e.message);
            return res.status(500).json({ error: "Internal server error" });
        }

        res.json(country);
    });
});

function parseBody(cachedCountry, body) {
    const $ = cheerio.load(body);
    const selection = $(".span-md-6.push-md-3.content__main", "#rs_read_this").children().eq(4).html();

    if (!selection) {
        throw new Error(`Could not make selection from info page for ${cachedCountry.normalizedTitle}`);
    }

    const objStart = selection.indexOf("{");
    const objEnd = selection.lastIndexOf("}");

    if (objStart < 0 || objEnd < 1) {
        throw new Error(`Could not find JSON from selection for ${cachedCountry.normalizedTitle}`);
    }

    try {
        var country = JSON.parse(selection.substring(objStart, objEnd + 1));
    }
    catch (e) {
        throw new Error(`Could not parse JSON from selection for ${cachedCountry.normalizedTitle} due to ${e.name}:${e.message}`);
    }

    try {
        country.Title = $("#page-title").text().trim();
    }
    catch (e) {
        throw new Error(`Could not select title from selection for ${cachedCountry.normalizedTitle} due to ${e.name}:${e.message}`);
    }

    country.NormalizedTitle = cachedCountry.normalizedTitle;
    country.URL = cachedCountry.url;
    
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
        throw new Error(`Could not parse advice levels JSON for ${cachedCountry.normalizedTitle} due to ${e.name}:${e.message}`);
    }

    if (levels && levels.isTA) {
        country.AdviceIssued = true;
        country.Advice = Array.isArray(levels.items) ? levels.items : []; 
    }
    else {
        country.AdviceIssued = false;
        country.Advice = [];
    }

    if (country.Smartraveller_x0020_Summary) {
        const $ = cheerio.load(country.Smartraveller_x0020_Summary);
        country.Summary = $.root().text().trim();
    }
    else {
        country.Summary = "";
    }

    delete country.ArticleStartDate;
    delete country.Smartraveller_x0020_Summary;
    delete country.Smartraveller_x0020_Advice_x0020_Levels;

    return country;
}

module.exports = router;