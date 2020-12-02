import { Component, ElementRef, NgZone, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, FormControl, FormGroup } from '@angular/forms';

import { FirebaseService } from './services/firebase.service';

import Peer from 'peerjs';
import util from 'peerjs';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
    @ViewChild('myVideo', {static: true}) private myVideo!: ElementRef<HTMLVideoElement>;
    @ViewChild('theirVideo', {static: true}) private theirVideo!: ElementRef<HTMLVideoElement>;

    public formGroup!: FormGroup;

    public peer?: Peer;
    public conn?:Peer.DataConnection;
    public peerConn?: Peer.DataConnection;
    public callConn?: Peer.MediaConnection;

    public myID: string = "";
    public otherID: string = "";

    public debugLevel: 0 | 1 | 2 | 3 = 0;

    public datas: {
        peerID: string;
        value: string;
        timestamp: number;
    }[] = [];

    public myStream?: MediaStream;

    public theirStream?: MediaStream;

    public handledRequiredInteraction: boolean = true;

    constructor(private fb: FormBuilder, private ngZone: NgZone, private firebaseService: FirebaseService) {

    }

    public ngOnInit(): void {
        console.log(util);

        this.formGroup = this.fb.group({
            'send': new FormControl({
                value: 'hello world',
                disabled: false,
            }),
        });

        const f = this.firebaseService.init();

        // console.log(f);

        const oldID: any = sessionStorage.getItem('my-id');

        if (oldID) {
            const onOpen = () => {
                this.connect();
            };

            this.setPeer(oldID, onOpen);
        }

        this.debugLevel = +(sessionStorage.getItem('debug-level') || 0) as any;
    }

    public submit(): void {
        const sendFormControl = this.formGroup.get('send');

        if (!sendFormControl) {
            return;
        }

        const value = sendFormControl.value;

        sendFormControl.patchValue('');

        this.send(value);
    }

    public setPeer(myID: 'moocow-a' | 'moocow-b', onOpen?: () => void) {
        this.myID = myID;

        sessionStorage.setItem('my-id', myID);

        this.otherID = myID === 'moocow-b' ? 'moocow-a' : 'moocow-b';
        
        // const debug__no_logs = 0;
        // const debug__show_only_errors = 1;
        // const debug__show_only_errors_and_warnings = 2;
        // const debug__show_all_logs = 3;

        if (this.peer) {
            this.peer.destroy();
        }

        this.peer = new Peer(this.myID, {
            debug: this.debugLevel,
            host: 'localhost',
            // host: 'moo-web-rtc-server.uc.r.appspot.com',
            port: 443,
            // secure: true,
            path: '/'
        });

        // this.util = this.peer.util;

        console.log("opening...", this.myID);

        this.peer.on('open', (id) => {
            this.ngZone.run(() => {
                console.log("peer - open", id);

                onOpen && onOpen();
            });
        });

        this.peer.on('connection', (conn) => {
            this.ngZone.run(() => {
                console.log("peer - connection", conn);

                this.peerConn = conn;
            
                conn.on('open', () => {
                    this.ngZone.run(() => {
                        console.log("peer > conn - open");
                
                        conn.on('data', (data: any) => {
                            this.ngZone.run(() => {
                                console.log("peer > conn - data", data);

                                this.datas.push({
                                    peerID: conn.peer,
                                    value: data.value || data,
                                    timestamp: Date.now(),
                                });

                            });
                        });
                    });
                });
        
                conn.on('close', () => {
                    this.ngZone.run(() => {
                        console.log("peer > conn - close");

                        if (this.theirStream) {
                            this.removeVideoStream(this.theirStream, this.theirVideo.nativeElement);
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

                        this.theirStream = stream;

                        this.bindVideoStream(this.theirVideo.nativeElement, stream);
                        console.log(stream);
                    });
                });
            });
            
        });
        
        this.peer.on('close', () => {
            this.ngZone.run(() => {
                console.log('peer - close');

                if (this.theirStream) {
                    this.removeVideoStream(this.theirStream, this.theirVideo.nativeElement);
                }

                this.disconnect();
            });
        });
           
        this.peer.on('disconnected', () => {
            this.ngZone.run(() => {
                console.log('peer - disconnected');
            });
        });
           
        this.peer.on('error', (error) => {
            this.ngZone.run(() => {
                console.log('peer - error');
                console.error(error);
            });
        });
    }

    public connect() {
        if (!this.peer) {
            return;
        }

        const conn = this.peer.connect(this.otherID, {
            serialization: 'json'// Safari support: https://github.com/peers/peerjs#safari
        });

        conn.on('close', () => {
            this.ngZone.run(() => {
                console.log("connect() conn - close");

                if (this.theirStream) {
                    this.removeVideoStream(this.theirStream, this.theirVideo.nativeElement);
                }
            });
        });
        
        conn.on('error', (error) => {
            this.ngZone.run(() => {
                console.log("connect() conn - error");
                console.error(error);
            });
        });

        this.conn = conn;
    }

    public disconnect() {
        console.log("disconnect", this.conn, this.peerConn, this.callConn);

        this.handledRequiredInteraction = true;

        if (this.myStream) {
            this.removeVideoStream(this.myStream, this.myVideo.nativeElement);
        }

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

    public send(value: any): void {
        if (!this.conn) {
            return;
        }

        const data = {
            value: value,
        };

        this.conn?.send(data);

        this.datas.push({
            peerID: this.peer?.id || '',
            value: data.value,
            timestamp: Date.now(),
        });
    }

    public call(): void {
        // TODO: prevent calling unless peer is the 'streamer' peer
        navigator.getUserMedia = navigator.getUserMedia || (navigator as any).webkitGetUserMedia || (navigator as any).mozGetUserMedia;
        
        navigator.getUserMedia({video: true, audio: true}, stream => {
            this.ngZone.run(() => {
                const call = this.peer?.call(this.otherID, stream);
                console.log(call);

                this.myStream = stream;
                this.bindVideoStream(this.myVideo.nativeElement, stream);    
                
                console.log(stream);
            });
        }, error => {
            this.ngZone.run(() => {
                console.error(error);
            });
        });
    }

    public playAllVideos(): void {
        // const videos = document.querySelectorAll('video');
        const videos: HTMLVideoElement[] = [];

        if (this.myStream) {
            videos.push(this.myVideo.nativeElement);
        }

        if (this.theirStream) {
            videos.push(this.theirVideo.nativeElement);
        }

        // if (!videos) {
        //     return;
        // }

        videos.forEach(video => {
            video.play();
        });
    }

    // source:  https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/srcObject#Supporting_fallback_to_the_src_property
    public bindVideoStream(video: HTMLVideoElement, stream: MediaStream): void {
        // const mediaSource = new MediaSource();
        // const video = document.createElement('video');

        // Older browsers may not have srcObject
        const clientSupportsMediaStreams = 'srcObject' in video;
        
        if (clientSupportsMediaStreams) {
            try {
                video.srcObject = stream;
            } catch (err) {
                if (err.name != "TypeError") {
                    throw err;
                }
                // Even if they do, they may only support MediaStream
                video.src = URL.createObjectURL(stream);
            }
        } else {
            video.src = URL.createObjectURL(stream);
        }

        this.handledRequiredInteraction = false;

        const [track] = stream.getVideoTracks();
        track.addEventListener('ended', () => {
            this.ngZone.run(() => {
                console.log('track ended', video, stream);
            });
        });

        track.onended = () => console.log('track onended');
    }

    public removeVideoStream(mediaStream: MediaStream, video?: HTMLVideoElement): void {
        const tracks = mediaStream.getTracks();

        tracks.forEach(track => track.stop());
        // for good measure? See
        // https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/stop#Stopping_a_video_stream
        if (video) {
            if (video.srcObject) {
                video.srcObject = null;
            }

            if (video.src) {
                video.src = "";
            }
        }
    }

    public handleRequiredInteraction(): void {
        this.playAllVideos();
        this.handledRequiredInteraction = true;
    }
}
