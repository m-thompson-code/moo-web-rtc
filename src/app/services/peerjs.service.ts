import { Injectable, NgZone } from '@angular/core';

import firebase from 'firebase/app';

import Peer from 'peerjs';
import util from 'peerjs';

import { FirebaseService } from './firebase.service';

const REMOTE_SERVER_HOST = 'moo-web-rtc-server.uc.r.appspot.com';

export class PingError extends Error {
    public __pingError: boolean = true;
    constructor(...params: any) {
        super(...params);
    }
};

export type RequestActionDataValue = 'call-me' | 'connect-me';

export interface RequestActionData {
    dataType: 'request-action';
    value: RequestActionDataValue;
}

export type PingDataValue = 'ping-ready' | 'send-ping-data-connection' | 'received-ping-data-connection' | 'send-ping-call-connection' | 'received-ping-call-connection';

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
    otherPeerID: string;
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
    mediaStream: MediaStream;
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
    // Used to send data
    public sentDataConnection?:Peer.DataConnection;
    // Used to receive data
    public requestedDataConnection?: Peer.DataConnection;
    // Used to sent media stream
    public sentMediaConnection?: Peer.MediaConnection;
    // Used to receive media stream
    public requestedMediaConnection?: Peer.MediaConnection;

    // public state: 'pending' | 'initalized' | 'destroyed' = 'pending';
    // public peerState: 'pending' | 'initalizing' | 'open' | 'connecting' | 'connected' | 'destroyed' = 'pending';

    public peerID: string;

    /**
     * Use setOtherPeerID to make sure connections are properly disconnected, etc
     */
    public otherPeerID: string;

    public mediaStream?: MediaStream;

    private _pingTimeout?: number;

    // TODO: remove ping state management if it's not needed (this is likely because we have a timeout for if the ping workflow fails)
    private _otherPeerIsPingReady: boolean = false;
    private _sentDataPing: boolean = false;
    private _receivedDataPing: boolean = false;
    private _completedDataPing: boolean = false;

    private _sendDataQueue: SendData[] = [];

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
        this.connect();

        // Call asap if we are the caller
        if (this.options.isCaller) {
            if (!this.mediaStream) {
                throw new Error("Unexpected missing mediaStream");
            }

            this.call(this.mediaStream);
        }
    }

    public _initalizePeer() {
        console.log("initalizing peer...", this.peerID);

        this.peer.on('open', (peerID: string) => {
            this.ngZone.run(() => {
                console.log("peer - open", peerID);

                if (peerID !== this.peerID) {
                    console.error("Unexpected peerID wasn't this peer peerID");
                    return;
                }

                console.log("initalized peer", peerID);

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

                if (this.requestedDataConnection) {
                    this.requestedDataConnection.close();
                    this.requestedDataConnection = undefined;
                }

                this.requestedDataConnection = conn;
            
                conn.on('open', () => {
                    this.ngZone.run(() => {
                        // Reject connections that aren't from the expected peer with otherPeerID
                        if (conn.peer !== this.otherPeerID) {
                            conn.close();
                            return;
                        }

                        if (!this.sentDataConnection) {
                            this.connect();
                        }

                        console.log("peer > requestedDataConnection open (we will handle data from this peer now) - open", conn.peer);
                
                        conn.on('data', (data: ReceiveData) => {
                            this.ngZone.run(() => {
                                console.log("peer > requestedDataConnection - data", data, conn.peer);

                                console.log(conn.peer);

                                if (conn.peer !== data.peerID) {
                                    console.warn("Unexpected mismatch peerID from data and DataConnection");
                                }

                                this.options.onData(data);
                                
                                if (data.dataType === 'ping') {
                                    this._onPingData(data);
                                }
                                
                                if (data.dataType === 'request-action') {
                                    this._onRequestActionData(data);
                                }
                            });
                        });
                    });
                });
        
                conn.on('close', () => {
                    this.ngZone.run(() => {
                        console.log("peer > requestedDataConnection - close", conn.peer);

                        if (this.sentDataConnection === conn) {
                            this.sentDataConnection = undefined;
                        }

                        if (this.sentMediaConnection) {
                            if (this.sentMediaConnection.peer === conn.peer) {
                                this.sentMediaConnection.close();
                            }
                        }
                    });
                });
                
                // Would type this as any, but if they ever update their types, having any would override it
                conn.on('error', (error) => {
                    this.ngZone.run(() => {
                        console.log("peer > requestedDataConnection - error", conn.peer);

                        this._handleError(error, conn);
                    });
                });
            });
        });

        this.peer.on('call', (mediaConnection: Peer.MediaConnection) => {
            this.ngZone.run(() => {
                console.log('peer > requestedMediaConnection', mediaConnection);

                // Reject calls if you are the caller
                // Also avoid calls from any peer that doesn't have the otherPeerID
                if (this.options.isCaller || mediaConnection.peer !== this.otherPeerID) {
                    console.warn("Unexpected call received from caller or peerID wasn't the expected otherPeerID");
                    mediaConnection.close();
                    return;
                }

                if (this.requestedMediaConnection) {
                    this.requestedMediaConnection.close();
                    this.requestedMediaConnection = undefined;
                }

                this.requestedMediaConnection = mediaConnection;

                // By not providing a MediaStream in the answer args, we establish a one-wall call
                mediaConnection.answer();

                mediaConnection.on('stream', (stream: MediaStream) => {
                    this.ngZone.run(() => {
                        console.log("peer > requestedMediaConnection - stream", mediaConnection.peer);

                        if (this.options.isCaller) {
                            throw new Error("Unexpected isCaller and accepting stream from a peer");
                        }

                        if (!this.options.onCall) {
                            throw new Error("Unexpected missing onCall");
                        }

                        if (mediaConnection.open) {
                            this._emitCallReceived();
                        }

                        this.options.onCall(mediaConnection, stream);
                    });
                });

                mediaConnection.on('close', () => {
                    this.ngZone.run(() => {
                        console.log("peer > requestedMediaConnection - close", mediaConnection.peer);

                        if (this.requestedMediaConnection === mediaConnection) {
                            this.sentDataConnection = undefined;

                            this.options.onCallConnectionClosed?.();
                        }
                    });
                });

                // Would type this as any, but if they ever update their types, having any would override it
                mediaConnection.on('error', (error) => {
                    this.ngZone.run(() => {
                        console.log('peer > requestedMediaConnection - error', mediaConnection.peer);

                        this._handleError(error, mediaConnection);
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
           
        // We don't use Peer.disconnect, so it is likely any disconnect is due to some kind of networking issue, let's default to reconnecting
        this.peer.on('disconnected', () => {
            this.ngZone.run(() => {
                console.log('peer - disconnected');

                this.peer.reconnect();
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
    public connect(): Peer.DataConnection | null {
        if (this.peer.destroyed) {
            console.warn("Unable to call connect since peer has been destroyed");
            return null;
        }

        console.log("send data connection requested...", this.otherPeerID);

        // Close any other sentDataConnections that may exist
        if (this.sentDataConnection) {
            this.sentDataConnection.close();
            this.sentDataConnection = undefined;

            this._resetPingStatus();

            this._clearSendDataQueue();
        }

        const conn = this.peer.connect(this.otherPeerID, {
            serialization: 'json'// Required for Safari support: https://github.com/peers/peerjs#safari
        });

        this.sentDataConnection = conn;

        conn.on('open', () => {
            this.ngZone.run(() => {
                console.log("peer > sentDataConnection - open", conn);

                // Ping other peer that this peer is ready to send data
                this._emitPingReady();

                // Send all datas that were pending for this peer's sendDataConnection to open
                this._reduceSendDataQueue();
            });
        });

        conn.on('close', () => {
            this.ngZone.run(() => {
                console.log("peer > sentDataConnection - close");

                if (this.sentDataConnection === conn) {
                    this.sentDataConnection = undefined;
                }
            });
        });
        
        // Would type this as any, but if they ever update their types, having any would override it
        conn.on('error', (error) => {
            this.ngZone.run(() => {
                console.log("peer > sentDataConnection - error", conn.peer);

                this._handleError(error, conn);
            });
        });

        return conn;
    }
    
    public requestOtherPeerToConnect(): void {
        const receivedData: ReceiveData & RequestActionData = {
            peerID: this.peer.id,
            value: 'connect-me',
            dataType: 'request-action',
            timestamp: Date.now(),
        };
        
        this.send(receivedData);
    }
        
    public requestOtherPeerToCall(): void {
        const receivedData: ReceiveData & RequestActionData = {
            peerID: this.peer.id,
            value: 'call-me',
            dataType: 'request-action',
            timestamp: Date.now(),
        };
        
        this.send(receivedData);
    }
    
    private _onRequestActionData(requestActionData: RequestActionData): void {
        console.log('_onRequestActionData', requestActionData);

        if (requestActionData.value === 'connect-me') {
            this.connect();

            this._pingDataConnection();
        } else if (requestActionData.value === 'call-me') {
            if (!this.mediaStream) {
                throw new Error("Unexpected missing mediaStream");
            }

            if (!this.sentMediaConnection?.open) {
                this.connect();
            }

            this.call(this.mediaStream);

            this._pingCallConnection();
        } else {
            console.warn("Unexpected requestActionData", requestActionData);
        }
    }

    private _resetPingStatus(): void {
        this._otherPeerIsPingReady = false;
        this._sentDataPing = false;
        this._receivedDataPing = false;
        this._completedDataPing = false;
    }
    
    private _emitPingReady(): void {
        const receivedData: ReceiveData & PingData = {
            peerID: this.peer.id,
            value: 'ping-ready',
            dataType: 'ping',
            timestamp: Date.now(),
        };
        
        this.send(receivedData);
    }

    private _startPingTimeout(): void {
        this._clearPing();

        this._pingTimeout = window.setTimeout(() => {
            this._handleError(new PingError("Ping timeout"), this.sentDataConnection);
        }, 10 * 1000);
    }

    private _pingDataConnection(): void {
        // if (!this._otherPeerIsPingReady) {
        //     throw new Error("Unexpected other peer is not ping ready");
        // }

        const receivedData: ReceiveData & PingData = {
            peerID: this.peer.id,
            value: 'send-ping-data-connection',
            dataType: 'ping',
            timestamp: Date.now(),
        };
        
        this.send(receivedData);

        this._sentDataPing = true;

        this._startPingTimeout();
    }
    
    private _pingCallConnection(): void {
        const receivedData: ReceiveData & PingData = {
            peerID: this.peer.id,
            value: 'send-ping-call-connection',
            dataType: 'ping',
            timestamp: Date.now(),
        };
        
        this.send(receivedData);

        this._startPingTimeout();
    }
    
    private _respondToDataPing(): void {
        const receivedData: ReceiveData & PingData = {
            peerID: this.peer.id,
            value: 'received-ping-data-connection',
            dataType: 'ping',
            timestamp: Date.now(),
        };
        
        this.send(receivedData);
    }
    
    private _emitCallReceived(): void {
        console.log("emitCallReceived");

        const receivedData: ReceiveData & PingData = {
            peerID: this.peer.id,
            value: 'received-ping-call-connection',
            dataType: 'ping',
            timestamp: Date.now(),
        };
        
        this.send(receivedData);
    }

    private _clearPing(): void {
        clearTimeout(this._pingTimeout);
    }
    
    private _onPingData(pingData: PingData): void {
        if (pingData.value === 'ping-ready') {
            // this._otherPeerIsPingReady = true;

            if (!this.sentDataConnection || !this.sentDataConnection?.open) {
                this.connect();
            }

            this._pingDataConnection();
        } else if (pingData.value === 'send-ping-data-connection') {
            this._receivedDataPing = true;

            this._respondToDataPing();
        } else if (pingData.value === 'received-ping-data-connection') {
            this._completedDataPing = true;

            this._clearPing();

            if (!this.options.isCaller) {
                return;
            }
            
            if (!this.sentMediaConnection || !this.sentMediaConnection?.open) {
                if (!this.mediaStream) {
                    throw new Error("Unexpected missing mediaStream");
                }

                this.call(this.mediaStream);
            }

            this._pingCallConnection();
        } else if (pingData.value === 'send-ping-call-connection') {
            if (this.requestedMediaConnection?.open) {
                this._emitCallReceived();
            }
        } else if (pingData.value === 'received-ping-call-connection') {
            this._clearPing();
        } else {
            console.warn("Unexpected pingData", pingData);
        }
    }

    private _clearSendDataQueue(): void {
        this._sendDataQueue = [];
    }

    private _reduceSendDataQueue(): void {
        if (!this.sentDataConnection || !this.sentDataConnection.open) {
            throw new Error("Unexpected missing or closed sendDataConnection");
        }

        for (const data of this._sendDataQueue) {
            this.send(data);
        }
    }

    public send(data: SendData): void {
        if (!this.sentDataConnection || !this.sentDataConnection?.open) {
            if (!this.sentDataConnection) {
                console.log("adding data to queue since sendDataConnection has not started yet", data);

                this.connect();
            } else {
                console.log("adding data to queue since sendDataConnection is not open yet", data);
            }

            console.log("adding data to queue since sendDataConnection has not started yet", data);
            this._sendDataQueue.unshift(data);

            if (this._sendDataQueue.length > 100) {
                throw new Error("Unexpected queue got too big");
            }

            return;
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

    public call(mediaStream: MediaStream): Peer.MediaConnection {
        this.mediaStream = mediaStream || this.mediaStream;

        if (!this.options.isCaller) {
            throw new Error("Unexpected call called from peer that isn't the  caller");
        }

        if (!this.mediaStream) {
            throw new Error("Unexpected missing mediaStream");
        }

        if (this.sentMediaConnection) {
            this.sentMediaConnection.close();
            this.sentMediaConnection = undefined;
        }

        const mediaConnection = this.peer.call(this.otherPeerID, this.mediaStream);

        // Reject calling if peer is not the caller
        // Also avoid calls from any peer that doesn't have the otherPeerID
        if (!this.options.isCaller || mediaConnection.peer !== this.otherPeerID) {
            mediaConnection.close();

            throw new Error("Unexpected call from a peer that is not the caller");
        }

        this.sentMediaConnection = mediaConnection;

        if (this.sentMediaConnection?.open) {
            this._pingCallConnection();
        }

        mediaConnection.on('close', () => {
            this.ngZone.run(() => {
                console.log("peer > sentMediaConnection - close");

                if (this.sentMediaConnection === mediaConnection) {
                    this.sentMediaConnection = undefined;
                }

                this.options.onCallConnectionClosed?.();
            });
        });

        // Would type this as any, but if they ever update their types, having any would override it
        mediaConnection.on('error', (error) => {
            this.ngZone.run(() => {
                console.log('peer > sentMediaConnection - error');

                console.warn("testing if connections when error are 'open'", mediaConnection.open);

                this._handleError(error, mediaConnection);
            });
        });

        console.log('call made', this.peer, mediaConnection, mediaStream);

        return mediaConnection;
    }

    /**
     * Sets otherPeerID and calls onOpen
     * @param otherPeerID value for the other peerID, if it's different, peer will disconnect all existing connections
     */
    public setOtherPeerID(otherPeerID: string): void {
        this.disconnectConnections();

        this.otherPeerID = otherPeerID;

        // reconnecting is managed through PeerWrapper.options.onConnectionsDisconnected
        this.options.onPeerInitalized && this.options.onPeerInitalized() || this._defaultOnPeerOpen();
    }
    
    /**
     * Used to disconnect all connections. We use this whenever any connection has been closed or if peer is destroyed
     */
    public disconnectConnections(): void {
        this._clearSendDataQueue();

        let emitDisconnectionHappened = false;

        this._resetPingStatus();
        
        // Clear out any pending pings
        this._clearPing();
        
        console.log("disconnect", this.sentDataConnection, this.requestedDataConnection, this.requestedMediaConnection);

        if (this.sentDataConnection) {
            this.sentDataConnection.close();
            this.sentDataConnection = undefined;
            emitDisconnectionHappened = true;
        }

        if (this.requestedDataConnection) {
            this.requestedDataConnection.close();
            this.requestedDataConnection = undefined;
            emitDisconnectionHappened = true;
        }
        
        if (this.sentMediaConnection) {
            this.sentMediaConnection.close();
            this.sentMediaConnection = undefined;
            emitDisconnectionHappened = true;
        }

        if (this.requestedMediaConnection) {
            this.requestedMediaConnection.close();
            this.requestedMediaConnection = undefined;
            emitDisconnectionHappened = true;
        }

        if (emitDisconnectionHappened) {
            this.options.onConnectionsDisconnected();
        }
    }

    public destroy(): void {
        let destroyHappened = false;

        if (!this.peer.destroyed) {
            destroyHappened = true;
        }

        // Clear out any pending pings
        this._clearPing();

        this.disconnectConnections();
        
        this.peer.destroy();

        if (destroyHappened) {
            this.options.onDestroy();
        }
    }
    
    private _handleError(error: any, connOrPeer?: Peer | Peer.DataConnection | Peer.MediaConnection): void {
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
        } else if (error.__pingError) {
            console.error('__pingError', error);
            disconnectConnections = false;
            this.requestOtherPeerToConnect();

            if (!this.options.isCaller) {
                this.requestOtherPeerToCall();
                // this.pingCallConnection();
            }
        } else {
            console.error(error);
        }

        try {
            this.options.onError(error);
        } catch(onError) {
            console.warn(onError);
        }

        // Exit early if no connOrPeer passed
        if (!connOrPeer) {
            return;
        }

        const peer = connOrPeer as Peer;

        if (destroyPeer || peer.destroyed === true) {
            console.error('peer was destroyed as a result of this error, cleaning up connections and peer object');

            this.destroy();

            return;
        }

        const conn = connOrPeer as (Peer.DataConnection | Peer.MediaConnection);

        if (disconnectConnections || !conn.open) {
            console.error('connection has closed as a result of this error, cleaning up connections');

            this.disconnectConnections();
        }
    }
}

@Injectable({
    providedIn: 'root'
})
export class PeerjsService {
    constructor(private ngZone: NgZone, private firebaseService: FirebaseService) {
        // TODO: use util
        // console.log(util);
    }

    public getRandomPeerID(): string {
        return firebase.firestore().collection("tmp").doc().id;
    }

    public getPeer(options: GetPeerOptions): PeerWrapper {
        return new PeerWrapper(this.ngZone, options);
    }
}
