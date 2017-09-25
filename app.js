'use strict'
const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');
const async = require('async');
var question = require('./question.js');
const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const DEBUG = true;
var answer = null;
var articlesData = [];

const server = app.listen(process.env.PORT || 3000, () => {
  console.log('Express server listening on port %d in %s mode', server.address().port, app.settings.env);
});


function sendMessage(event) {
  var GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
  var FACEBOOK_ACCESS_TOKEN = process.env.FACEBOOK_ACCESS_TOKEN;
  var FACEBOOK_VERIFICATION_TOKEN = process.env.FACEBOOK_VERIFICATION_TOKEN;
  let sender = event.sender.id;
  var topic = event.message.text.replace(/\s/g, ""); // Removing whitespace from input to use in request url

  // generalized error message when no data for questions is found
  function wikiNotFoundError() {
    request({ // request to facebook page to send error message
      url: 'https://graph.facebook.com/v2.10/me/messages',
      qs: { access_token: FACEBOOK_ACCESS_TOKEN },
      method: 'POST',
      json: {
        recipient: { id: sender },
        message: { text: 'I\'m sorry. I did not receive any data. Please try again!' }
      }
    });
  }

  //
  function sendQuestion(articlesData) {
    var siteUrl = 'https://language.googleapis.com/v1beta2/documents:analyzeEntities?key=' + GOOGLE_API_KEY; // Google NLP API url
    var options =
      {
        url: siteUrl,
        method: 'POST',
        body:
        {
          "document":
          {
            "type": "PLAIN_TEXT",
            "language": "EN",
            "content": articlesData[0] // first text paragraph in first article for now
          },
          "encodingType": "UTF8"
        },
        json: true
      }
    request(options, function (error, response, body) {
      if (!error && response.statusCode === 200) {
        var data = body.entities;
        data.sort(function (a, b) { // sorting entities according to their salience
          return b.salience - a.salience;
        });
        if (data.length > 1) {
          var blank='_______';
          answer = data[0].name;
          console.log(answer.length);

          var newText = '';
          if(DEBUG) newText += answer + ':::\n\n';

          // Insert blanks into all occurrences of answer within question
          var arrAns = articlesData[0].split(answer);
          for(var i in arrAns){
            newText += arrAns[i];
            if(i < arrAns.length - 1){
              newText += blank;
            }
          }
          console.log('ANSWER: ' + answer);
          request({
            url: 'https://graph.facebook.com/v2.10/me/messages',
            qs: { access_token: FACEBOOK_ACCESS_TOKEN },
            method: 'POST',
            json: {
              recipient: { id: sender },
              message: { text: newText }
            }
          });
          // Remove element so question  won't be asked again
          articlesData.shift();
        }
        else {
          wikiNotFoundError();
        }
      }
    });
  }

  //
  function get50Questions(articles, callback) {
    articlesData = [];
    async.forEachOf(articles, function (value, key, callback) {
      var siteUrl = 'http://' + topic + '.wikia.com/api/v1/Articles/AsSimpleJson?id=' + value; // wikia API url
      request.get(siteUrl, function (error, response, body) {
        if (!error && response.statusCode === 200) {
          try {
            var sections = JSON.parse(body).sections; // get all the sections in the article
          }
          catch (e) {
            wikiNotFoundError();
            return;
          }
          for (var i = 0; i < sections.length; i++) {
            if (sections[i]) { //if the section has data
              if (sections[i].content[0]) { // if the content has data
                if (sections[i].content[0].text) { // if the text exists
                  articlesData.push(sections[i].content[0].text);
                  break;
                }
              }
            }
          }
          callback(); // sendQuestion()
        } else {
          wikiNotFoundError();
        }
      });
    }, function (err) {
      if (err) {
        return callback(null);
      } else {
        return callback(articlesData);
      }
    });
  }

  //
  function getFiftyArticles() {
    var articles = [];
    var siteUrl = 'http://' + topic + '.wikia.com/api/v1/Articles/Top?Limit=250';
    var rand;
    // Create list of 250 popular articles
    request.get(siteUrl, function (error, response, body) {
      if (!error && response.statusCode === 200) {
        try {
          var items = JSON.parse(body).items;
        }
        catch (e) {
          wikiNotFoundError();
          return;
        }
        var itemsCount = items.length;
        var noOfQs = (itemsCount < 50) ? itemsCount : 50;
        for (var i = 0; i < noOfQs; i++) {
          rand = Math.random();
          rand *= itemsCount;
          articles.push(items[Math.floor(rand)].id);
        }
        get50Questions(articles, function (articlesData) {
          sendQuestion(articlesData);
        });
      }
    });
  }

  //
  if(!answer) {
    getFiftyArticles();
  } else {
    var reply = (topic.toLowerCase() === answer.toLowerCase()) ? 'Correct!' : 'Incorrect!';
    request({
      url: 'https://graph.facebook.com/v2.10/me/messages',
      qs: { access_token: FACEBOOK_ACCESS_TOKEN },
      method: 'POST',
      json: {
        recipient: { id: sender },
        message: { text: reply }
      }
    });
    sendQuestion(articlesData);
  }
}

// For Facebook Webhook Verification
app.get('/webhook', (req, res) => {
  if (req.query['hub.mode'] && req.query['hub.verify_token'] === FACEBOOK_VERIFICATION_TOKEN) {
    res.status(200).send(req.query['hub.challenge']);
  } else {
    res.status(403).end();
  }
});

// Handle user input
app.post('/webhook', (req, res) => {
  if (req.body.object === 'page') {
    req.body.entry.forEach((entry) => {
      entry.messaging.forEach((event) => {
        if (event.message && event.message.text) {
          sendMessage(event);
        }
      });
    });
    res.status(200).end();
  }
});
