
import express from 'express';
import cors from 'cors';
import { ExpressPeerServer } from 'peer';

// source: https://github.com/peers/peerjs-server#running-in-google-app-engine

const app = express();

app.enable('trust proxy');

// Automatically allow cross-origin requests
app.use(cors({ origin: true }));

const PORT = process.env.PORT || 443;

const server = app.listen(PORT, () => {
    console.log(`App listening on port ${PORT}`);
    console.log('Press Ctrl+C to quit.');
});

const config: any = {
    debug: true,
    // proxied: true,
    path: '/',
};

const peerServer = ExpressPeerServer(server, config);

peerServer.on('connection', (client) => {
    console.log("connection", client.getId());
});

peerServer.on('disconnect', (client) => {
    console.log("disconnect", client.getId());
});

peerServer.on('error', (error) => {
    console.error(error);
    console.error("error", error?.message);
});

app.use('/', peerServer);

module.exports = app;
