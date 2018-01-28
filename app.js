const express = require("express");

const countries = require("./countries");
const settings = require("./get-settings");

const app = express();
app.listen(settings.port);
app.use("/countries", countries);