import { Injectable, NgZone } from '@angular/core';

import firebase from 'firebase/app';

import Peer from 'peerjs';
import util from 'peerjs';

import { FirebaseService } from './firebase.service';

const REMOTE_SERVER_HOST = 'moo-web-rtc-server.uc.r.appspot.com';

export type OnDataFunc = (
    data: any,
    peerID: string,
) => void;

interface _PeerWrapperInit {
    peerID: string;
    otherPeerID?: string;
    onPeerInitalized?: () => void;
    onData: OnDataFunc;
    onCall?: (conn: Peer.MediaConnection, stream: MediaStream) => void;
    onCallConnectionClosed?: () => void;
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
    public sentConnection?:Peer.DataConnection;
    public requestedConnection?: Peer.DataConnection;
    public sentCallConnection?: Peer.MediaConnection;
    public requestedCallConnection?: Peer.MediaConnection;

    public state: 'pending' | 'initalized' | 'destroyed' = 'pending';
    public peerState: 'pending' | 'initalizing' | 'open' | 'connecting' | 'connected' | 'off' = 'pending';

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

                if (this.requestedConnection) {
                    this.requestedConnection.close();
                    this.requestedConnection = undefined;
                }

                this.requestedConnection = conn;
            
                conn.on('open', () => {
                    this.ngZone.run(() => {
                        console.log("peer > requestedConnection open (we will reserve data from this peer now) - open", conn.peer);

                        this.peerState = 'connected';
                
                        conn.on('data', (data: any) => {
                            this.ngZone.run(() => {
                                console.log("peer > conn - data", data, conn.peer);

                                this.options.onData(data, conn.peer);
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

                        this._handleError(error);
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

                        this._handleError(error);
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

                this._handleError(error);
            });
        });

        return this.peer;
    }

    /**
     * Connect to other peer. A nice note is that the Peer.DataConnection returned 
     * from this method doesn't have an on data listener. The propery spot is the 
     * Peer.DataConnection found on the requestedConnection
     */
    public connect(otherPeerID?: string): Peer.DataConnection {
        this.otherPeerID = otherPeerID || this.otherPeerID;

        if (!this.otherPeerID) {
            throw new Error("Unexpected missing otherPeerID");
        }

        // TODO: check if destroyed

        console.log("data connection requested...", this.otherPeerID);

        // Close any other sentConnections that may exist
        if (this.sentConnection) {
            this.sentConnection.close();
        }

        const conn = this.peer.connect(this.otherPeerID, {
            serialization: 'json'// Required for Safari support: https://github.com/peers/peerjs#safari
        });

        this.sentConnection = conn;

        conn.on('open', () => {
            this.ngZone.run(() => {
                console.log("peer > sentConnection - open", conn.peer);
            });
        });

        conn.on('close', () => {
            this.ngZone.run(() => {
                console.log("peer > sentConnection - close");

                this.disconnectConnections();
            });
        });
        
        // Would type this as any, but if they ever update their types, having any would override it
        conn.on('error', (error) => {
            this.ngZone.run(() => {
                console.warn("testing if connections when error are 'open'", conn.open, conn.peer);

                console.log("peer > sentConnection - error", conn.peer);

                // TODO: handle error better and perform retries

                this._handleError(error);
            });
        });

        return conn;
    }
    
    /**
     * Used to disconnect all connections. We use this whenever any connection has been closed or if peer is destroyed
     */
    public disconnectConnections(): void {
        // TODO: add onDisconnect to clean up MediaStream stuff
        console.log("disconnect", this.sentConnection, this.requestedConnection, this.requestedCallConnection);

        if (this.sentConnection) {
            this.sentConnection.close();
            this.sentConnection = undefined;
        }

        if (this.requestedConnection) {
            this.requestedConnection.close();
            this.requestedConnection = undefined;
        }
        
        if (this.sentCallConnection) {
            this.sentCallConnection.close();
            this.sentCallConnection = undefined;
        }

        if (this.requestedCallConnection) {
            this.requestedCallConnection.close();
            this.requestedCallConnection = undefined;
        }

        if (this.peer && this.peerState !== 'off') {
            if (this.peerState === 'connecting') {
                console.warn("Unexpected connecting is interupted (peerState is 'connecting')");
            }
            this.peerState = 'open';
        } else {
            this.peerState = 'off';
        }
    }

    public send(value: any): void {
        if (!this.sentConnection) {
            throw new Error("Unexpected missing sentConnection. This is required to send data to the other peer");
        }

        const data = {
            value: value,
            sentTimestamp: Date.now(),
        };

        this.sentConnection.send(data);

        this.options.onData(data, this.peer.id);
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

                // this.disconnectConnections();

                // // TODO: handle error better and perform retries

                // this.options.onCallConnectionClosed?.();
            });
        });

        // Would type this as any, but if they ever update their types, having any would override it
        conn.on('error', (error) => {
            this.ngZone.run(() => {
                console.log('peer > sentCallConnection - error');

                console.warn("testing if connections when error are 'open'", conn.open);

                // TODO: handle error better and perform retries

                this._handleError(error);
            });
        });

        console.log('call made', this.peer, conn, mediaStream);

        return conn;
    }

    private _handleError(error: any): void {
        if (error.type) {
            if (error.type === 'browser-incompatible') {
                // TODO: this error properly
                console.error('browser-incompatible', error);
            } else if (error.type === 'disconnect') {
                // TODO: this error properly
                console.error('disconnect', error);
            } else if (error.type === 'disconnect') {
                // TODO: this error properly
                console.error('invalid-id', error);
            } else if (error.type === 'invalid-id') {
                // TODO: this error properly
                console.error('network', error);
            } else if (error.type === 'network') {
                // TODO: this error properly
                console.error('peer-unavailable', error);
            } else if (error.type === 'peer-unavailable') {
                // TODO: this error properly
                console.error('ssl-unavailable', error);
            } else if (error.type === 'ssl-unavailable') {
                // TODO: this error properly
                console.error('server-error', error);
            } else if (error.type === 'server-error') {
                // TODO: this error properly
                console.error('socket-error', error);
            } else if (error.type === 'socket-error') {
                // TODO: this error properly
                console.error('socket-closed', error);
            } else if (error.type === 'socket-closed') {
                // TODO: this error properly
                console.error('unavailable-id', error);
            }
        }

        console.error(error);
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
