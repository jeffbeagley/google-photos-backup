'use strict';

import bodyParser from 'body-parser';
import express from 'express';
import passport from 'passport';
import http from 'http';
import session from 'express-session';
import sessionFileStore from 'session-file-store';
import fetch from 'node-fetch';

import {auth} from './auth.js';
import {config} from './config.js';

const app = express();
const fileStore = sessionFileStore(session);
const server = http.Server(app);

auth(passport);

const sessionMiddleware = session({
  resave: true,
  saveUninitialized: true,
  store: new fileStore({}),
  secret: 'photo frame sample',
});

app.use(express.static('static'));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));
app.use(sessionMiddleware);
app.use(passport.initialize());
app.use(passport.session());

app.get('/', (req, res) => {
  if (!req.user || !req.isAuthenticated()) {
    // Not logged in yet.
    res.json({status: "not logged in"});
  } else {
    res.json({status: "logged in"})
  }
});

app.get('/auth/google', passport.authenticate('google', {
  scope: config.scopes,
  failureFlash: true,  // Display errors to the user.
  session: true,
}));

// Callback receiver for the OAuth process after log in.
app.get(
    '/auth/google/callback',
    passport.authenticate(
        'google', {failureRedirect: '/', failureFlash: true, session: true}),
    (req, res) => {
      // User has logged in.
      console.log('User has logged in.');
      req.session.save(() => {
        res.redirect('/');
      });
    });

app.get('/getAlbums', async (req, res) => {
	if (!req.user || !req.isAuthenticated()) {
		return res.json({status: "not logged in"});

	}

  	const userId = req.user.profile.id;


    // Albums not in cache, retrieve the albums from the Library API
    // and return them
    const data = await libraryApiGetAlbums(req.user.token);
    if (data.error) {
      // Error occured during the request. Albums could not be loaded.
      returnError(res, data);
    } else {
      res.status(200).send(data);
    }
  
});

app.get('/getItems', async (req, res) => {
	if (!req.user || !req.isAuthenticated()) {
		return res.json({status: "not logged in"});

	}

  	const userId = req.user.profile.id;


    // Albums not in cache, retrieve the albums from the Library API
    // and return them
    const data = await libraryApiGetItems(req.user.token);
    if (data.error) {
      // Error occured during the request. Albums could not be loaded.
      returnError(res, data);
    } else {
      res.status(200).send(data);
    }
  
});

server.listen(config.port, () => {
  console.log(`App listening on port ${config.port}`);
  console.log('Press Ctrl+C to quit.');
});

// Returns a list of all albums owner by the logged in user from the Library
// API.
async function libraryApiGetAlbums(authToken) {
  let albums = [];
  let nextPageToken = null;
  let error = null;

  let parameters = new URLSearchParams();
  parameters.append('pageSize', config.albumPageSize);

  try {
    // Loop while there is a nextpageToken property in the response until all
    // albums have been listed.
    do {
      console.log(`Loading albums. Received so far: ${albums.length}`);
      // Make a GET request to load the albums with optional parameters (the
      // pageToken if set).
      const albumResponse = await fetch(config.apiEndpoint + '/v1/albums?' + parameters, {
        method: 'get',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + authToken
        },
      });

      const result = await checkStatus(albumResponse);

      console.log(`Response: ${result}`);

      if (result && result.albums) {
        console.log(`Number of albums received: ${result.albums.length}`);
        // Parse albums and add them to the list, skipping empty entries.
        const items = result.albums.filter(x => !!x);

        albums = albums.concat(items);
      }
    if(result.nextPageToken){
      parameters.set('pageToken', result.nextPageToken);
    }else{
      parameters.delete('pageToken');
    }
      
      // Loop until all albums have been listed and no new nextPageToken is
      // returned.
    } while (parameters.has('pageToken'));

  } catch (err) {
    // Log the error and prepare to return it.
    error = err;
    console.log(error);
  }

  console.log('Albums loaded.');
  return {albums, error};
}

async function libraryApiGetItems(authToken) {
  let items = [];
  let nextPageToken = null;
  let error = null;

  let parameters = new URLSearchParams();
  parameters.append('pageSize', config.photosPageSize);

  try {
    do {
      console.log(`Loading media items. Received so far: ${items.length}`);
      // Make a GET request to load the albums with optional parameters (the
      // pageToken if set).
      const itemResponse = await fetch(config.apiEndpoint + '/v1/mediaItems?' + parameters, {
        method: 'get',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + authToken
        },
      });

      const result = await checkStatus(itemResponse);

      console.log(`Response: ${result}`);

      if (result && result.mediaItems) {
        console.log(`Number of items received: ${result.mediaItems.length}`);
        // Parse albums and add them to the list, skipping empty entries.
        const mediaitems = result.mediaItems.filter(x => !!x);

        items = items.concat(mediaitems);
      }
    if(result.nextPageToken){
      parameters.set('pageToken', result.nextPageToken);
    }else{
      parameters.delete('pageToken');
    }
      
      // Loop until all albums have been listed and no new nextPageToken is
      // returned.
    } while (parameters.has('pageToken'));

  } catch (err) {
    // Log the error and prepare to return it.
    error = err;
    console.log(error);
  }

  console.log('items loaded.');
  return {items, error};
}


// Return the body as JSON if the request was successful, or thrown a StatusError.
async function checkStatus(response){
  if (!response.ok){
    // Throw a StatusError if a non-OK HTTP status was returned.
    let message = "";
    try{
          // Try to parse the response body as JSON, in case the server returned a useful response.
        message = await response.json();
    } catch( err ){
      // Ignore if no JSON payload was retrieved and use the status text instead.
    }
    throw new StatusError(response.status, response.statusText, message);
  }

  // If the HTTP status is OK, return the body as JSON.
  return await response.json();
}

// Responds with an error status code and the encapsulated data.error.
function returnError(res, data) {
  // Return the same status code that was returned in the error or use 500
  // otherwise.
  const statusCode = data.error.status || 500;
  // Return the error.
  res.status(statusCode).send(JSON.stringify(data.error));
}

// Custom error that contains a status, title and a server message.
class StatusError extends Error {
  constructor(status, title, serverMessage, ...params) {
    super(...params)
    this.status = status;
    this.statusTitle = title;
    this.serverMessage= serverMessage;
  }
}
