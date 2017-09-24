
/*-----------------------------------------------------------------------------
A Facebook Messenger bot that uses the Qwikia api to get articles about the topic that YOU choose, and generate questions from them on the fly.
-----------------------------------------------------------------------------*/
'use strict'
const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');
const async = require('async');
var question = require('./question.js');
var answer = 'ANSWER';
const app =express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true}));

const server = app.listen(process.env.PORT || 3000, () => {
  console.log('Express server listening on port %d in %s mode', server.address().port, app.settings.env);
});

//
function sendMessage(event) {
  let sender = event.sender.id;
  var topic = event.message.text.replace(/\s/g, "") ;

  //
  function wikiNotFoundError() {
    request({
      url: 'https://graph.facebook.com/v2.10/me/messages',
      qs: {access_token: 'EAARiEsAuvXEBAHvp6kDS4bAcyIrkudgRZCieT78BWO7ZAsbfAzIdkjMe7EJlv731DezS6Ic5crJs2OOTZCIVXVf3GijGjnwzNRkcZAwJHJaFPfdERSsp9dvZCuKUnCchIEZCjE9BOv58Pcc6EdrKV3wSK5lkKkDLhqGFjwjUua0gZDZD'},
      method: 'POST',
      json: {
        recipient: {id: sender},
        message: {text: 'I\'m sorry. I did not receive any data. Please try again!'}
      }
    });
  }

  // Given a list of article ids, generate
  function get50Questions(articles, callback) {
    var articlesData = [];
    async.forEachOf(articles, function ( value, key, callback) {
      var siteUrl = 'http://' + topic + '.wikia.com/api/v1/Articles/AsSimpleJson?id=' + value;
      request.get(siteUrl, function(error, response, body) {
        if(!error && response.statusCode === 200) {
          try {
            var sections = JSON.parse(body).sections;
          }
          catch (e) {
            wikiNotFoundError();
            return;
          }
          //console.log(sections[0].content[0].text);
          if(sections[key]) {
            for(var i = 0; i < sections.length; i++) {
              if(sections[key].content[i]) {
                if(sections[key].content[i].text) {
                  articlesData.push(sections[key].content[i].text);
                  break;
                }
              }
            }
          }
          callback();
        } else {
          // Topic not found, prompt user to enter different topic
          console.log(JSON.stringify(body));
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

  function getFiftyArticles() {
    var articles =[];
    var siteUrl = 'http://' + topic + '.wikia.com/api/v1/Articles/Top?Limit=250';
    var rand;
    // Create list of 250 popular articles
    request.get(siteUrl, function(error, response, body) {
      if(!error && response.statusCode === 200) {
        try {
          var items = JSON.parse(body).items;
        }
        catch (e) {
          wikiNotFoundError();
          return;
        }

        var itemsCount = items.length;
        var noOfQs = (itemsCount < 50)? itemsCount : 50;

        for(var i = 0; i < noOfQs; i++) {
          rand = Math.random();
          rand *= itemsCount;
          articles.push(items[Math.floor(rand)].id);
        }

        get50Questions(articles, function(articlesData) {
          var YOUR_API_KEY = 'AIzaSyAgWYqV90V6NCI3CUNWStkwH9-rPRsnt4M';
          var siteUrl = 'https://language.googleapis.com/v1beta2/documents:analyzeEntities?key='+YOUR_API_KEY;
          var options =
          {
            url: siteUrl,
            method: 'POST',
            body:
            {
              "document":
              {
                "type":"PLAIN_TEXT",
                "language": "EN",
                "content": articlesData[0]
              },
              "encodingType":"UTF8"
            },
            json: true
          }
          request(options, function (error, response, body) {
            if(!error && response.statusCode === 200) {
              var data = body.entities;
              data.sort(function(a, b){
                return b.salience - a.salience;
              });
              console.log(data);

              if(data.length > 1) {

                var blank='_______';
                var newText = '';
                answer = data[0].name;
                console.log(answer.length);

                // Insert blanks into all occurrences of answer within question
                var arrAns = data[0].split(answer);
                for(i in arrAns){
                  newText += arrAns[i];
                  if(i < arrAns.length - 1){
                    newText += blank;
                  }
                }

                // Send request to Messenger
                request({
                  url: 'https://graph.facebook.com/v2.10/me/messages',
                  qs: {access_token: 'EAARiEsAuvXEBAHvp6kDS4bAcyIrkudgRZCieT78BWO7ZAsbfAzIdkjMe7EJlv731DezS6Ic5crJs2OOTZCIVXVf3GijGjnwzNRkcZAwJHJaFPfdERSsp9dvZCuKUnCchIEZCjE9BOv58Pcc6EdrKV3wSK5lkKkDLhqGFjwjUua0gZDZD'},
                  method: 'POST',
                  json: {
                    recipient: {id: sender},
                    message: {text: newText}
                  }
                });
              }
              else {
                wikiNotFoundError();
              }
            }
          });
        });
      }
    });
  }
  getFiftyArticles();
}

//
app.get('/webhook', (req, res) => {
  if (req.query['hub.mode'] && req.query['hub.verify_token'] === 'tuxedo_cat') {
    res.status(200).send(req.query['hub.challenge']);
  } else {
    res.status(403).end();
  }
});

//
app.post('/webhook', (req, res) => {
  console.log(req.body);
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

/* var bot = new builder.UniversalBot(connector, function (session) {
function processElements(arr, str){
if(arr.length == 0) {
return str;
}
else {
for(var i = 0; i < arr.length; i++) {
str+=arr[i].text;
processElements(arr[i].elements, str);
}
return str;
}
}
var topic = session.message.text;
var articles = [];
var questions = [];
function getFiftyArticles() {
var siteUrl = 'http://' + topic + '.wikia.com/api/v1/Articles/Top?Limit=250';
var rand;
// Create list of 250 popular articles
request.get(siteUrl, function(error, response, body) {
if(!error && response.statusCode === 200) {
var items = JSON.parse(body).items;
var itemsCount = items.length;
for(var i = 0; i < 50 i++) {
rand = Math.random();
rand *= itemsCount;
articles.push(items[Math.floor(rand)].id);
}
get50Questions(articles, function(articlesData) {
getNLPData(articlesData);
});
}
});
}
function findTriviaSection(sections) {
for(var i = 0; i < sections.length; i++){
if(sections[i].title === "Trivia") return i;
}
return -1;
}
function get50Questions(articles, callback) {
var articlesData = [];
async.forEachOf(articles, function ( value, key, callback) {
var textArray = [];
var siteUrl = 'http://' + topic + '.wikia.com/api/v1/Articles/AsSimpleJson?id=' + value;
request.get(siteUrl, function(error, response, body) {
if(!error && response.statusCode === 200) {
var sections = JSON.parse(body).sections;
// Look for Trivia section
var triviaIndex = findTriviaSection(sections);
var triviaText = '';
if(triviaIndex > -1) {
var content = sections[triviaIndex].content;
for(var j = 0; j < content.length; j++) {
if(content[j].type === "paragraph") {
triviaText+=content[j].text;
triviaText+=" ";
}
else if(content[j].type === "list") {
triviaText+=processElements(content[j].elements, '');
}
else {
console.log("!!!!!!!!!NEW TYPE DETECTED!!!!!!!!");
}
}
textArray.push(triviaText);
} else {
var summary = sections[0].content;
var summaryText = '';
for(var j = 0; j < summary.length; j++) {
if(summary[j].type === "paragraph") {
summaryText += summary[j].text;
} else if(summary[j].type === "list") {
summaryText+=processElements(summary[j].elements, '');
} else {
console.log("!!!!!!!!!NEW TYPE DETECTED!!!!!!!!");
}
}
// Can't find Trivia section
for(var i = 1; i < sections.length; i++) {
var content = sections[i].content;
var text = '';
for(var j = 0; j < content.length; j++) {
if(content[j].type === "paragraph") {
text+=content[j].text;
}
else if(content[j].type === "list") {
text+=processElements(content[j].elements, '');
}
else {
console.log("!!!!!!!!!NEW TYPE DETECTED!!!!!!!!");
}
}
textArray.push(text)

}

}
var articleData = new Object();
if(triviaText.length > 0) {
summaryText = triviaText;
}
articleData["summary"] = summaryText;
articleData["rest"] = textArray;
articlesData.push(articleData);
callback();
}
});
},
function (err) {
if(err)
return callback(null);
else {
return callback(articlesData);
}
})
}
function getNLPData(articlesData) {
session.send(articlesData);
}
getFiftyArticles();
}); */
