import { Injectable, NgZone } from '@angular/core';

import firebase from 'firebase/app';

import Peer from 'peerjs';
import util from 'peerjs';
import { Observable, Subscription } from 'rxjs';
import { FirebaseService, MachineData } from './firebase.service';

const REMOTE_SERVER_HOST = 'moo-web-rtc-server.uc.r.appspot.com';

interface _PeerWrapperInit {
    peerID: string;
    otherPeerID?: string;
    onOpen?: () => void;
    onData: OnDataFunc;
    onCall?: (conn: Peer.MediaConnection, stream: MediaStream) => void;
    server?: 'local' | 'remote';
    debugLevel?: DebugLevel;
}

interface CantCall extends _PeerWrapperInit {
    mediaStream?: never;
    isCaller?: false;
    onCall: (conn: Peer.MediaConnection, stream: MediaStream) => void;
}

interface CanCall extends _PeerWrapperInit {
    mediaStream?: MediaStream;
    isCaller: true;
}

export type DebugLevel = 0 | 1 | 2 | 3;

export type GetPeerOptions = CantCall | CanCall;
// export type GetPeerOptions = (CantCall | CanCall) & {
//     mediaStream?: MediaStream;
//     isCaller?: boolean;
// };

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
    public peerConn?: Peer.DataConnection;
    public callConn?: Peer.MediaConnection;

    public state: 'pending' | 'initalized' | 'destroyed' = 'pending';
    public peerState: 'pending' | 'opening' | 'open' | 'connecting' | 'connected' | 'off' = 'pending';

    public peerID: string;
    public otherPeerID?: string;

    public mediaStream?: MediaStream;

    constructor(private ngZone: NgZone, public options: GetPeerOptions) {
        this.peerID = options.peerID;
        this.otherPeerID = options.otherPeerID;

        this.mediaStream = options.mediaStream;

        this.peer = new Peer(this.peerID, {
            debug: options.debugLevel || 0,
            host: options.server === 'local' ? 'localhost' : REMOTE_SERVER_HOST,
            port: 443,
            secure: options.server === 'local' ? false : true,
            path: '/'
        });

        this._initalizePeer();
    }

    private _defaultOnOpen(): void {
        if (this.otherPeerID) {
            this.connect(this.otherPeerID);

            if (this.options.isCaller && this.mediaStream) {
                this.call(this.otherPeerID, this.mediaStream);                
            }
        }
    }

    public _initalizePeer() {
        console.log("opening...", this.peerID);

        this.peerState = 'opening';

        this.peer.on('open', (peerID) => {
            this.ngZone.run(() => {
                console.log("peer - open", peerID);

                this.peerState = 'open';

                this.options.onOpen && this.options.onOpen() || this._defaultOnOpen();
            });
        });
        
        this.peer.on('connection', (conn) => {
            this.ngZone.run(() => {
                console.log("peer - connection", conn);

                this.peerState = 'connecting';

                this.peerConn = conn;
            
                conn.on('open', () => {
                    this.ngZone.run(() => {
                        console.log("peer > conn - open");

                        this.peerState = 'connected';
                
                        conn.on('data', (data: any) => {
                            this.ngZone.run(() => {
                                console.log("peer > conn - data", data);

                                this.options.onData(
                                    data,
                                    conn.peer,
                                );
                            });
                        });
                    });
                });
        
                conn.on('close', () => {
                    this.ngZone.run(() => {
                        console.log("peer > conn - close");

                        if (this.peer) {
                            this.peerState = 'open';
                        } else {
                            this.peerState = 'off';
                        }

                        this.disconnectConnections();
                    });
                });
                
                conn.on('error', (error) => {
                    this.ngZone.run(() => {
                        console.log("peer > conn - error");

                        this._handleError(error);
                    });
                });
            });
        });

        this.peer.on('call', conn => {
            this.ngZone.run(() => {
                console.log('peer - call', conn);

                if (this.options.isCaller || conn.peer !== this.otherPeerID) {
                    conn.close();
                    return;
                }

                if (this.callConn) {
                    this.callConn.close();
                    this.callConn = undefined;
                }

                this.callConn = conn;

                conn.answer();// By not providing a MediaStream in the answer args, we establish a one-wall call

                conn.on('stream', stream => {
                    this.ngZone.run(() => {
                        console.log(stream);

                        if (!this.options.onCall) {
                            throw new Error("Unexpected missing onCall");
                        }

                        this.options.onCall(conn, stream);
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
           
        this.peer.on('error', (error) => {
            this.ngZone.run(() => {
                console.log('peer - error');
                this._handleError(error);
            });
        });

        return this.peer;
    }

    public connect(otherPeerID?: string): Peer.PeerConnectOption {
        this.otherPeerID = otherPeerID || this.otherPeerID;

        if (!this.otherPeerID) {
            throw new Error("Unexpected missing otherPeerID");
        }

        // TODO: check if destroyed

        this.sentConnection = this.peer.connect(this.otherPeerID, {
            serialization: 'json'// Required for Safari support: https://github.com/peers/peerjs#safari
        });

        this.sentConnection.on('close', () => {
            this.ngZone.run(() => {
                console.log("connect() conn - close");

                this.disconnectConnections();
            });
        });
        
        this.sentConnection.on('error', (error) => {
            this.ngZone.run(() => {
                console.log("connect() conn - error");
                this._handleError(error);
            });
        });

        return this.sentConnection;
    }
    
    public disconnectConnections() {
        // TODO: add onDisconnect to clean up MediaStream stuff
        console.log("disconnect", this.sentConnection, this.peerConn, this.callConn);

        if (this.sentConnection) {
            this.sentConnection.close();
            this.sentConnection = undefined;
        }

        if (this.peerConn) {
            this.peerConn.close();
            this.peerConn = undefined;
        }

        if (this.callConn) {
            this.callConn.close();
            this.callConn = undefined;
        }
    }

    public send(value: any): void {
        if (!this.sentConnection) {
            return;
        }

        const data = {
            value: value,
        };

        this.sentConnection.send(data);

        this.options.onData(
            data,
            this.peer.id,
        );
    }

    public call(otherPeerID?: string, mediaStream?: MediaStream): void {
        this.otherPeerID = otherPeerID || this.otherPeerID;
        this.mediaStream = mediaStream || this.mediaStream;

        if (!this.otherPeerID) {
            throw new Error("Unexpected missing otherPeerID");
        }

        if (!this.mediaStream) {
            throw new Error("Unexpected missing mediaStream");
        }

        const call = this.peer?.call(this.otherPeerID, this.mediaStream);
        console.log(this.peer, call);
    }

    private _handleError(error: any): void {
        if (error.type) {
            if (error.type === 'browser-incompatible') {
                // TODO: handle browser issues
                console.error('browser-incompatible', error);
            } else if (error.type === 'disconnect') {
                // TODO: handle browser issues
                console.error('disconnect', error);
            } else if (error.type === 'disconnect') {
                // TODO: handle browser issues
                console.error('invalid-id', error);
            } else if (error.type === 'invalid-id') {
                // TODO: handle browser issues
                console.error('network', error);
            } else if (error.type === 'network') {
                // TODO: handle browser issues
                console.error('peer-unavailable', error);
            } else if (error.type === 'peer-unavailable') {
                // TODO: handle browser issues
                console.error('ssl-unavailable', error);
            } else if (error.type === 'ssl-unavailable') {
                // TODO: handle browser issues
                console.error('server-error', error);
            } else if (error.type === 'server-error') {
                // TODO: handle browser issues
                console.error('socket-error', error);
            } else if (error.type === 'socket-error') {
                // TODO: handle browser issues
                console.error('socket-closed', error);
            } else if (error.type === 'socket-closed') {
                // TODO: handle browser issues
                console.error('unavailable-id', error);
            }
        }

        console.error(error);
    }

    public destroy(): void {
        this.disconnectConnections();
        
        this.peer.destroy();
    }
}

export type OnDataFunc = (
    data: any,
    peerID: string,
) => void;


@Injectable({
    providedIn: 'root'
})
export class PeerjsService {
    // public peer?: Peer;
    // public conn?:Peer.DataConnection;
    // public peerConn?: Peer.DataConnection;
    // public callConn?: Peer.MediaConnection;

    // public peerID: string = "";

    // public debugLevel: DebugLevel = 0;

    // public server: 'remote' | 'local' = 'local';

    // public peerState: 'off' | 'opening' | 'open' | 'connecting' | 'connected' = 'off';

    constructor(private ngZone: NgZone, private firebaseService: FirebaseService) {
        console.log(util);
    }

    public getRandomPeerID(): string {
        return firebase.firestore().collection("tmp").doc().id;
    }

    public getPeer(options: GetPeerOptions): PeerWrapper {
        return new PeerWrapper(this.ngZone, options);
    }
}
