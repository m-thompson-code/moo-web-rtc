import { Injectable, NgZone } from '@angular/core';

import firebase from 'firebase/app';

import Peer from 'peerjs';
import util from 'peerjs';

import { FirebaseService } from './firebase.service';

const REMOTE_SERVER_HOST = 'moo-web-rtc-server.uc.r.appspot.com';

export type RequestActionDataValue = 'call-me' | 'connect-me' | 'message-me';

export interface RequestActionData {
    dataType: 'request-action';
    value: RequestActionDataValue;
}

export type PingDataValue = 'send-ping-data-connection' | 'received-ping-data-connection' | 'send-ping-call-connection' | 'received-ping-call-connection';

export interface PingData {
    dataType: 'ping';
    value: PingDataValue;
}

export type MessageDataValue = string;

export interface MessageData {
    dataType: 'message';
    value: MessageDataValue;
}

export type ControllerDataValue = 'left-pressed' | 'left-released' | 'right-pressed' | 'right-released' | 'up-pressed' | 'up-released' | 'down-pressed' | 'down-released' | 'drop-pressed' | 'drop-released';

export interface ControllerData {
    dataType: 'controller';
    value: ControllerDataValue;
}

export type SendData = RequestActionData | PingData | MessageData | ControllerData;

export type ReceiveData = SendData & {
    peerID: string;
    timestamp: number;// Milliseconds
}

export type OnDataFunc = (data: ReceiveData) => void;

interface _PeerWrapperInit {
    peerID: string;
    otherPeerID?: string;
    onPeerInitalized?: () => void;
    onData: OnDataFunc;
    onCall?: (conn: Peer.MediaConnection, stream: MediaStream) => void;
    onCallConnectionClosed?: () => void;
    onError: (error: any) => void;
    onConnectionsDisconnected: () => void;
    onDestroy:() => void;
    server?: 'local' | 'remote';
    debugLevel?: DebugLevel;
}

interface IsNotCaller extends _PeerWrapperInit {
    mediaStream?: never;
    isCaller?: false;
    onCall: (conn: Peer.MediaConnection, stream: MediaStream) => void;
    onCallConnectionClosed: () => void;
}

interface IsCaller extends _PeerWrapperInit {
    mediaStream?: MediaStream;
    isCaller: true;
    onCall?: never;
    onCallConnectionClosed?: never;
}

export type DebugLevel = 0 | 1 | 2 | 3;

export type GetPeerOptions = IsNotCaller | IsCaller;

/**
 * Wrapper for the `Peer` object from `peerjs` library. 
 * Used to collect the needed connections (`Peer.DataConnection`/`Peer.MediaConnection`)
 * 
 * The purpose of this wrapper is to simplify using an expected one-to-one peer connection 
 * where one peer is expected to be the caller and the other is not
 * 
 * Be sure to call `PeerWrapper.destroy` when you're done this any instances of this 
 * class to avoid memory leaks, persistant unexpected peers or peer connections
 */
export class PeerWrapper {
    public peer: Peer;
    public sentDataConnection?:Peer.DataConnection;
    public requestedDataConnection?: Peer.DataConnection;
    public sentCallConnection?: Peer.MediaConnection;
    public requestedCallConnection?: Peer.MediaConnection;

    public state: 'pending' | 'initalized' | 'destroyed' = 'pending';
    public peerState: 'pending' | 'initalizing' | 'open' | 'connecting' | 'connected' | 'destroyed' = 'pending';

    public peerID: string;

    /**
     * Use setOtherPeerID to make sure connections are properly disconnected, etc
     */
    public otherPeerID?: string;

    public mediaStream?: MediaStream;

    constructor(private ngZone: NgZone, public options: GetPeerOptions) {
        this.peerID = options.peerID;
        this.otherPeerID = options.otherPeerID;

        this.mediaStream = options.mediaStream;

        this.peer = new Peer(this.peerID, {
            debug: options.debugLevel || 0,
            host: options.server === 'local' ? 'localhost' : REMOTE_SERVER_HOST,
            port: 443,// The default port used by peerJS and seems to be the right port for our GAE hosting for the peerJS server
            secure: options.server === 'local' ? false : true,
            path: '/'
        });

        this._initalizePeer();
    }

    /**
     * A default onPeerInitalized function that tries to connect asap and call asap if caller
     */
    private _defaultOnPeerOpen(): void {
        // Try to connect asap if we know the other peerID
        if (this.otherPeerID) {
            this.connect(this.otherPeerID);

            // Call asap if we are the caller
            if (this.options.isCaller && this.mediaStream) {
                this.call(this.mediaStream, this.otherPeerID);                
            }
        }
    }

    public _initalizePeer() {
        console.log("initalizing...", this.peerID);

        // Listen to the peer opening (Initializing)
        // This is when using Peer.DataConnection/Peer.MediaConnection are ready to be used
        this.peerState = 'initalizing';

        this.peer.on('open', (peerID: string) => {
            this.ngZone.run(() => {
                console.log("peer - open", peerID);

                if (peerID !== this.peerID) {
                    console.error("Unexpected peerID wasn't this peer peerID");
                    return;
                }

                console.log("initalized", peerID);

                this.peerState = 'open';

                this.options.onPeerInitalized && this.options.onPeerInitalized() || this._defaultOnPeerOpen();
            });
        });
        
        // Listen to requested connections
        this.peer.on('connection', (conn: Peer.DataConnection) => {
            this.ngZone.run(() => {
                console.log("peer - requested connection pending", conn);

                // Refuse other connections not from the expected otherPeerID
                if (conn.peer !== this.otherPeerID) {
                    console.warn("Unexpected connection was from a peer that was not a peer with otherPeerID");
                    conn.close();
                }

                this.peerState = 'connecting';

                if (this.requestedDataConnection) {
                    this.requestedDataConnection.close();
                    this.requestedDataConnection = undefined;
                }

                this.requestedDataConnection = conn;
            
                conn.on('open', () => {
                    this.ngZone.run(() => {
                        console.log("peer > requestedDataConnection open (we will reserve data from this peer now) - open", conn.peer);

                        this.peerState = 'connected';
                
                        conn.on('data', (data: any) => {
                            this.ngZone.run(() => {
                                console.log("peer > conn - data", data, conn.peer);

                                console.log(conn.peer);

                                if (conn.peer !== data.peerID) {
                                    console.warn("Unexpected mismatch peerID from data and DataConnection");
                                }

                                this.options.onData(data);
                            });
                        });
                    });
                });
        
                conn.on('close', () => {
                    this.ngZone.run(() => {
                        console.log("peer > conn - close", conn.peer);

                        this.disconnectConnections();
                    });
                });
                
                // Would type this as any, but if they ever update their types, having any would override it
                conn.on('error', (error) => {
                    this.ngZone.run(() => {
                        console.log("peer > conn - error", conn.peer);

                        console.warn("testing if connections when error are 'open'", conn.open, conn.peer);

                        // TODO: handle error better and perform retries

                        this._handleError(error, conn);
                    });
                });
            });
        });

        this.peer.on('call', (conn: Peer.MediaConnection) => {
            this.ngZone.run(() => {
                console.log('peer > requestedCallConnection', conn);

                // Reject calls if you are the caller
                // Also avoid calls from any peer that doesn't have the otherPeerID
                if (this.options.isCaller || conn.peer !== this.otherPeerID) {
                    console.warn("Unexpected call received from caller or peerID wasn't the expected otherPeerID");
                    conn.close();
                    return;
                }

                if (this.requestedCallConnection) {
                    this.requestedCallConnection.close();
                    this.requestedCallConnection = undefined;
                }

                this.requestedCallConnection = conn;

                // By not providing a MediaStream in the answer args, we establish a one-wall call
                conn.answer();

                conn.on('open', () => {
                    this.ngZone.run(() => {
                        console.log("peer > requestedCallConnection - open", conn.peer);
                    });
                });

                conn.on('stream', (stream: MediaStream) => {
                    this.ngZone.run(() => {
                        console.log("peer > requestedCallConnection - stream", conn.peer);

                        if (this.options.isCaller) {
                            throw new Error("Unexpected isCaller and accepting stream from a peer");
                        }

                        if (!this.options.onCall) {
                            throw new Error("Unexpected missing onCall");
                        }

                        this.options.onCall(conn, stream);
                    });
                });

                conn.on('close', () => {
                    this.ngZone.run(() => {
                        console.log("peer > requestedCallConnection - close", conn.peer);
        
                        this.disconnectConnections();

                        // TODO: handle error better and perform retries

                        this.options.onCallConnectionClosed?.();
                    });
                });

                // Would type this as any, but if they ever update their types, having any would override it
                conn.on('error', (error) => {
                    this.ngZone.run(() => {
                        console.log('peer > requestedCallConnection - error', conn.peer);

                        console.warn("testing if connections when error are 'open'", conn.open, conn.peer);

                        // TODO: handle error better and perform retries

                        this._handleError(error, conn);
                    });
                });
            });
        });
        
        this.peer.on('close', () => {
            this.ngZone.run(() => {
                console.log('peer - close');

                this.disconnectConnections();
            });
        });
           
        this.peer.on('disconnected', () => {
            this.ngZone.run(() => {
                console.log('peer - disconnected');

                this.disconnectConnections();
            });
        });
        
        // Would type this as any, but if they ever update their types, having any would override it
        this.peer.on('error', (error) => {
            this.ngZone.run(() => {
                console.log('peer - error');

                this._handleError(error, this.peer);
            });
        });

        return this.peer;
    }

    /**
     * Connect to other peer. A nice note is that the Peer.DataConnection returned 
     * from this method doesn't have an on data listener. The propery spot is the 
     * Peer.DataConnection found on the requestedDataConnection
     */
    public connect(otherPeerID?: string): Peer.DataConnection {
        this.otherPeerID = otherPeerID || this.otherPeerID;

        if (!this.otherPeerID) {
            throw new Error("Unexpected missing otherPeerID");
        }

        // TODO: check if destroyed

        console.log("data connection requested...", this.otherPeerID);

        // Close any other sentDataConnections that may exist
        if (this.sentDataConnection) {
            this.sentDataConnection.close();
        }

        const conn = this.peer.connect(this.otherPeerID, {
            serialization: 'json'// Required for Safari support: https://github.com/peers/peerjs#safari
        });

        this.sentDataConnection = conn;

        conn.on('open', () => {
            this.ngZone.run(() => {
                console.log("peer > sentDataConnection - open", conn.peer);
            });
        });

        conn.on('close', () => {
            this.ngZone.run(() => {
                console.log("peer > sentDataConnection - close");

                this.disconnectConnections();
            });
        });
        
        // Would type this as any, but if they ever update their types, having any would override it
        conn.on('error', (error) => {
            this.ngZone.run(() => {
                console.warn("testing if connections when error are 'open'", conn.open, conn.peer);

                console.log("peer > sentDataConnection - error", conn.peer);

                // TODO: handle error better and perform retries

                this._handleError(error, conn);
            });
        });

        return conn;
    }
    
    /**
     * Used to disconnect all connections. We use this whenever any connection has been closed or if peer is destroyed
     */
    public disconnectConnections(): void {
        // TODO: add onDisconnect to clean up MediaStream stuff
        console.log("disconnect", this.sentDataConnection, this.requestedDataConnection, this.requestedCallConnection);

        if (this.sentDataConnection) {
            this.sentDataConnection.close();
            this.sentDataConnection = undefined;
        }

        if (this.requestedDataConnection) {
            this.requestedDataConnection.close();
            this.requestedDataConnection = undefined;
        }
        
        if (this.sentCallConnection) {
            this.sentCallConnection.close();
            this.sentCallConnection = undefined;
        }

        if (this.requestedCallConnection) {
            this.requestedCallConnection.close();
            this.requestedCallConnection = undefined;
        }

        if (this.peer && this.peerState !== 'destroyed') {
            if (this.peerState === 'connecting') {
                console.warn("Unexpected connecting is interupted (peerState is 'connecting')");
            } else {
                this.peerState = 'open';
            }
        } else {
            this.peerState = 'destroyed';
        }
    }

    public send(data: SendData): void {
        if (!this.sentDataConnection) {
            throw new Error("Unexpected missing sentDataConnection. This is required to send data to the other peer");
        }

        // TODO: validate dataType

        const receivedData: ReceiveData = {
            peerID: this.peer.id,
            value: data.value,
            dataType: data.dataType as any,
            timestamp: Date.now(),
        };

        this.sentDataConnection.send(receivedData);

        this.options.onData(receivedData);
    }

    public call(mediaStream?: MediaStream, otherPeerID?: string): Peer.MediaConnection {
        this.otherPeerID = otherPeerID || this.otherPeerID;
        this.mediaStream = mediaStream || this.mediaStream;

        if (!this.options.isCaller) {
            throw new Error("Unexpected call called from peer that isn't the  caller");
        }

        if (!this.otherPeerID) {
            throw new Error("Unexpected missing otherPeerID");
        }

        if (!this.mediaStream) {
            throw new Error("Unexpected missing mediaStream");
        }

        if (this.sentCallConnection) {
            this.sentCallConnection.close();
            this.sentCallConnection = undefined;
        }

        const conn = this.peer.call(this.otherPeerID, this.mediaStream);

        // Reject calling if peer is not the caller
        // Also avoid calls from any peer that doesn't have the otherPeerID
        if (!this.options.isCaller || conn.peer !== this.otherPeerID) {
            conn.close();

            throw new Error("Unexpected call from a peer that is not the caller");
        }

        this.sentCallConnection = conn;

        conn.on('open', () => {
            this.ngZone.run(() => {
                console.log("peer > sentCallConnection - open", conn.peer);
            });
        });

        conn.on('close', () => {
            this.ngZone.run(() => {
                console.log("peer > sentCallConnection - close");

                // TODO: properly handle if this call has closed
                // Handle if we should retry or just let it go

                this.disconnectConnections();

                // TODO: handle error better and perform retries

                this.options.onCallConnectionClosed?.();
            });
        });

        // Would type this as any, but if they ever update their types, having any would override it
        conn.on('error', (error) => {
            this.ngZone.run(() => {
                console.log('peer > sentCallConnection - error');

                console.warn("testing if connections when error are 'open'", conn.open);

                // TODO: handle error better and perform retries

                this._handleError(error, conn);
            });
        });

        console.log('call made', this.peer, conn, mediaStream);

        return conn;
    }

    private _handleError(error: any, connOrPeer: Peer | Peer.DataConnection | Peer.MediaConnection): void {
        let destroyPeer = false;
        let disconnectConnections = false;

        if (error.type) {
            if (error.type === 'browser-incompatible') {
                console.error('browser-incompatible', error);
                // The client's browser does not support some or all WebRTC features that you are trying to use.
                // Fatal error, peerJS should destroy peer for us

                destroyPeer = true;
                disconnectConnections = true;
            } else if (error.type === 'disconnected') {
                console.error('disconnected', error);
                // You've already disconnected this peer from the server and can no longer make any new connections on it.
                // Error is labeled as not fatal, so peerJS won't destroy the peer as it normally would in other errors that are fatal

                // TODO: should we destroy peer and clean up connections?
                destroyPeer = true;
                disconnectConnections = true;
            } else if (error.type === 'invalid-id') {
                console.error('invalid-id', error);
                // The ID passed into the Peer constructor contains illegal characters.
                // Fatal error, peerJS should destroy peer for us

                destroyPeer = true;
                disconnectConnections = true;
            } else if (error.type === 'network') {
                console.error('network', error);
                // This error occures: "Lost or cannot establish a connection to the signalling server"
                // Error is labeled as not fatal, so peerJS won't destroy the peer as it normally would in other errors that are fatal

                // TODO: this network error properly (maybe we should clean up connections)
            } else if (error.type === 'peer-unavailable') {
                console.error('peer-unavailable', error);
                // Peer that was attempted to be connected was unavailable
                // Error is labeled as not fatal, so peerJS won't destroy the peer as it normally would in other errors that are fatal

                // Clean up connections
                disconnectConnections = true;
            } else if (error.type === 'ssl-unavailable') {
                console.error('ssl-unavailable', error);
                // PeerJS is being used securely, but the cloud server does not support SSL. Use a custom PeerServer.
                // Fatal error, peerJS should destroy peer for us

                destroyPeer = true;
                disconnectConnections = true;
            } else if (error.type === 'server-error') {
                console.error('server-error', error);
                // Unable to reach the server.
                // Fatal error, peerJS should destroy peer for us

                destroyPeer = true;
                disconnectConnections = true;
            } else if (error.type === 'socket-error') {
                console.error('socket-error', error);
                // An error from the underlying socket.
                // Fatal error, peerJS should destroy peer for us

                destroyPeer = true;
                disconnectConnections = true;
            } else if (error.type === 'socket-closed') {
                console.error('socket-closed', error);
                // The underlying socket closed unexpectedly.
                // Fatal error, peerJS should destroy peer for us

                destroyPeer = true;
                disconnectConnections = true;
            } else if (error.type === 'unavailable-id') {
                console.error('unavailable-id', error);
                // Labeled as sometimes fatal
                // We don't try to reconnect peers if they disconnect, so we shouldn't run into this error
                // Instead we create a new peer

                // Clean up will be handled below as needed for peer, but let's close connections to be safe
                disconnectConnections = true;
            } else if (error.type === 'webrtc') {
                console.error('webrtc', error);
                // Native WebRTC errors.
                // Error is labeled as not fatal, so peerJS won't destroy the peer as it normally would in other errors that are fatal

                // TODO: handle Native WebRTC errors (?) Can't find a reference to any list of errors
            } else {
                // Unexpected type
                console.error("Unexpected error type", error.type, error);
            }
        } else {
            console.error(error);
        }

        try {
            this.options.onError(error);
        } catch(onError) {
            console.warn(onError);
        }

        const peer = connOrPeer as Peer;

        if (peer.destroyed === true) {
            console.error('peer was destroyed as a result of this error, cleaning up connections and peer object');

            this.disconnectConnections();

            this.destroy();

            return;
        }

        const conn = connOrPeer as (Peer.DataConnection | Peer.MediaConnection);

        if (disconnectConnections || !conn.open) {
            console.error('connection has closed as a result of this error, cleaning up connections');

            this.disconnectConnections();
        }
    }

    /**
     * Sets otherPeerID and calls onOpen
     * @param otherPeerID value for the other peerID, if it's different, peer will disconnect all existing connections and call onOpen
     */
    public setOtherPeerID(otherPeerID: string): void {
        if (this.otherPeerID !== otherPeerID) {
            this.disconnectConnections();
        }

        this.otherPeerID = otherPeerID;

        this.options.onPeerInitalized && this.options.onPeerInitalized() || this._defaultOnPeerOpen();
    }

    public destroy(): void {
        this.disconnectConnections();
        
        this.peer.destroy();

        this.peerState = 'destroyed';
    }
}

@Injectable({
    providedIn: 'root'
})
export class PeerjsService {
    constructor(private ngZone: NgZone, private firebaseService: FirebaseService) {
        // TODO: use util
        console.log(util);
    }

    public getRandomPeerID(): string {
        return firebase.firestore().collection("tmp").doc().id;
    }

    public getPeer(options: GetPeerOptions): PeerWrapper {
        return new PeerWrapper(this.ngZone, options);
    }
}
