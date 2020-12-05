import { Injectable, NgZone } from '@angular/core';

import firebase from 'firebase/app';

import Peer from 'peerjs';
import util from 'peerjs';
import { Observable, Subscription } from 'rxjs';
import { FirebaseService, MachineData } from './firebase.service';

const REMOTE_SERVER_HOST = 'moo-web-rtc-server.uc.r.appspot.com';

export type OnDataFunc = (
    data: any,
    peerID: string,
) => void;

export interface GetPeerOptions {
    onOpen?: () => void;
    onData?: OnDataFunc;
    onCall?: (conn: Peer.MediaConnection, stream: MediaStream) => void;
}

@Injectable({
    providedIn: 'root'
})
export class PeerjsService {
    public peer?: Peer;
    public conn?:Peer.DataConnection;
    public peerConn?: Peer.DataConnection;
    public callConn?: Peer.MediaConnection;

    public peerID: string = "";

    public debugLevel: 0 | 1 | 2 | 3 = 0;

    public server: 'remote' | 'local' = 'local';

    public peerState: 'off' | 'opening' | 'open' | 'connecting' | 'connected' = 'off';

    constructor(private ngZone: NgZone, private firebaseService: FirebaseService) {
        console.log(util);

        this.debugLevel = +(sessionStorage.getItem('debug-level') || 0) as any;

        // if (environment.env !== 'dev') {
            this.server = 'remote';
        // }
    }

    public getRandomPeerID(): string {
        return firebase.firestore().collection("tmp").doc().id;
    }

    public destroyPeer(): void {
        if (this.peer) {
            this.peer.destroy();
        }

        this.peerID = '';

        this.peerState = 'off';
    }

    public getPeer(peerID: string, options: GetPeerOptions): Peer {
        this.destroyPeer();

        this.peerID = peerID;

        this.peer = new Peer(this.peerID, {
            debug: this.debugLevel || 0,
            host: this.server === 'local' ? 'localhost' : REMOTE_SERVER_HOST,
            port: 443,
            secure: this.server === 'local' ? false : true,
            path: '/'
        });

        console.log("opening...", this.peerID);

        this.peerState = 'opening';

        this.peer.on('open', (id) => {
            this.ngZone.run(() => {
                console.log("peer - open", id);

                this.peerState = 'open';

                options.onOpen && options.onOpen();
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

                                options.onData && options.onData(
                                    data,
                                    conn.peer,
                                );

                                // this.datas.push({
                                //     peerID: conn.peer,
                                //     value: data.value || data,
                                //     timestamp: Date.now(),
                                // });
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

                        this.disconnect();
                    });
                });
                
                conn.on('error', (error) => {
                    this.ngZone.run(() => {
                        console.log("peer > conn - error");
                        console.error(error);
                    });
                });
            });
        });

        this.peer.on('call', conn => {
            this.ngZone.run(() => {
                console.log('peer - call', conn);

                // TODO: prevent answering if peer is the 'streamer' peer

                conn.answer();// By not providing a MediaStream in the answer args, we establish a one-wall call

                this.callConn = conn;

                conn.on('stream', stream => {
                    this.ngZone.run(() => {
                        // `stream` is the MediaStream of the remote peer.
                        // Here you'd add it to an HTML video/canvas element.

                        // if (this.theirStream) {
                        //     this.stopTracks(this.theirStream);
                        // }

                        // this.theirStream = stream;

                        // this.bindVideoStream(this.theirVideo.nativeElement, stream);
                        console.log(stream);

                        options.onCall && options.onCall(conn, stream);
                    });
                });
            });
            
        });
        
        this.peer.on('close', () => {
            this.ngZone.run(() => {
                console.log('peer - close');

                this.disconnect();
            });
        });
           
        this.peer.on('disconnected', () => {
            this.ngZone.run(() => {
                console.log('peer - disconnected');

                this.disconnect();
            });
        });
           
        this.peer.on('error', (error) => {
            this.ngZone.run(() => {
                console.log('peer - error');
                console.error(error);
            });
        });

        return this.peer;
    }

    public connect(otherPeerID: string): Peer.PeerConnectOption | null {
        if (!this.peer) {
            console.warn("Unexpected missing peer. Cannot connect without a peer (0)");
            return null;
        }

        if (!this.peer) {
            console.warn("Unexpected missing peer. Cannot connect without a peer (1)");
            return null;
        }

        const conn = this.peer.connect(otherPeerID, {
            serialization: 'json'// Safari support: https://github.com/peers/peerjs#safari
        });

        conn.on('close', () => {
            this.ngZone.run(() => {
                console.log("connect() conn - close");

                this.disconnect();
            });
        });
        
        conn.on('error', (error) => {
            this.ngZone.run(() => {
                console.log("connect() conn - error");
                console.error(error);
            });
        });

        this.conn = conn;

        return conn;
    }

    public disconnect() {
        console.log("disconnect", this.conn, this.peerConn, this.callConn);

        // this.handledRequiredInteraction = true;

        // if (this.theirStream) {
        //     this.removeVideoStream(this.theirStream, this.theirVideo.nativeElement);
        // }

        // if (this.myStream) {
        //     this.removeVideoStream(this.myStream, this.myVideo.nativeElement);
        // }

        if (this.conn) {
            this.conn.close();
            this.conn = undefined;
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

    public send(value: any, onData: OnDataFunc): void {
        if (!this.peer || !this.conn) {
            return;
        }

        const data = {
            value: value,
        };

        this.conn.send(data);

        onData(
            data,
            this.peer.id,
        );

        // this.datas.push({
        //     peerID: this.peer?.id || '',
        //     value: data.value,
        //     timestamp: Date.now(),
        // });
    }

    public call(peerID: string, stream: MediaStream): void {
        // // TODO: prevent calling unless peer is the 'streamer' peer
        // navigator.getUserMedia = navigator.getUserMedia || (navigator as any).webkitGetUserMedia || (navigator as any).mozGetUserMedia;
        
        // navigator.getUserMedia({video: true, audio: true}, stream => {
        //     this.ngZone.run(() => {
        //         const call = this.peer?.call(peerID, stream);
        //         console.log(call);

        //         // this.myStream = stream;
        //         // this.bindVideoStream(this.myVideo.nativeElement, stream);    
                
        //         console.log(stream);
        //     });
        // }, error => {
        //     this.ngZone.run(() => {
        //         console.error(error);
        //     });
        // });

        const call = this.peer?.call(peerID, stream);
        console.log(this.peer, call);
    }
}
