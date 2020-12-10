import { Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Subscription } from 'rxjs';

import { FirebaseService, MachineData, PrivatePlayerData } from '@app/services/firebase.service';
import { ControllerDataValue, PeerjsService, PeerWrapper, ReceiveData } from '@app/services/peerjs.service';
import { VideoService } from '@app/services/video.service';
import { FormBuilder, FormControl, FormGroup } from '@angular/forms';

@Component({
    selector: 'app-machine',
    templateUrl: './machine.component.html',
    styleUrls: ['./machine.component.scss']
})
export class MachineComponent implements OnInit, OnDestroy {
    @ViewChild('canvas', {static: true}) private canvas!: ElementRef<HTMLCanvasElement>;
    @ViewChild('video', {static: true}) private video!: ElementRef<HTMLVideoElement>;

    public formGroup!: FormGroup;

    private _sub?: Subscription;
    private _controllerSub?: Subscription;

    public peerID!: string;
    public currentPlayerPeerID?: string;
    public peerWrapper?: PeerWrapper;

    public currentPrivatePlayersData: {
        value: PrivatePlayerData | undefined;
        isPending: boolean;
    } = { value: undefined, isPending: true };

    public machineData: {
        value: MachineData | undefined;
        isPending: boolean;
    } = { value: undefined, isPending: true };

    public machineMediaStream?: MediaStream;
    public canvasStream!: MediaStream;

    public datas: ReceiveData[] = [];
    
    public errors: {
        errorType?: string;
        errorMessage?: string;
    }[] = [];

    public ballX: number = 500/2;
    public ballY: number = 250/2;

    public ballX2: number = 500/2;
    public ballY2: number = 250/2;

    public showRed: boolean = true;
    public showBlue: boolean = true;

    public controllerMovement: 'up' | 'down' | 'left' | 'right' | 'drop' | 'none' = 'none';
    public controllerMovement2: 'up' | 'down' | 'left' | 'right' | 'drop' | 'none' = 'none';

    public mediaStreamMode: 'canvas' | 'camera' = 'canvas';

    constructor(private fb: FormBuilder, private ngZone: NgZone, private peerjsService: PeerjsService, 
        private firebaseService: FirebaseService, public videoService: VideoService) { }

    public ngOnInit(): void {
        this._init();
    }

    private _init(): void {
        this.video.nativeElement.muted = true;

        this.peerID = this._getMyMachinePeerID();

        this.formGroup = this.fb.group({
            'send': new FormControl({
                value: 'hello world',
                disabled: false,
            }),
        });

        this.initalizeCanvas();

        this._getMediaStream().then(mediaStream => {
            this.machineMediaStream = mediaStream;

            this.videoService.bindVideoStream(this.video.nativeElement, this.machineMediaStream);

            this.initalizePeer();

            if (this.currentPrivatePlayersData.value?.peerID) {
                this.connect();
            }
        }, error => {
            this.ngZone.run(() => {
                console.error(error);
                debugger;
            });
        });

        this._sub = this.firebaseService.getCurrentPrivatePlayer().subscribe(privatePlayer => {
            this.currentPrivatePlayersData = {
                value: privatePlayer,
                isPending: false,
            };

            this.currentPlayerPeerID = this.currentPrivatePlayersData.value?.peerID;

            this.initalizePeer();

            this.clearDatas();
        });

        this._sub.add(this.firebaseService.getMachineData().subscribe(machine => {
            this.machineData = {
                value: machine,
                isPending: false,
            };
        }));
    }

    public setStream(mode: 'canvas' | 'camera'): void {
        if (this.mediaStreamMode !== mode) {
            this.mediaStreamMode = mode;

            this._getMediaStream().then(mediaStream => {
                this.machineMediaStream = mediaStream;

                this.videoService.bindVideoStream(this.video.nativeElement, this.machineMediaStream);

                this.initalizePeer();

                this.peerWrapper?.call(mediaStream);
            });
        }
    }

    private _getMediaStream(): Promise<MediaStream> {
        if (this.mediaStreamMode === 'canvas') {
            return Promise.resolve((this.canvas.nativeElement as any).captureStream() as MediaStream);
        }

        return new Promise((resolve, reject) => {
            // this.ngZone.run(() => {});// Do I need this? I don't think I do since this isn't really a 'Promise' anymore due to angular converting Promises to ZoneAwarePromise
            navigator.getUserMedia = navigator.getUserMedia || (navigator as any).webkitGetUserMedia || (navigator as any).mozGetUserMedia;
        
            // TODO: Bring back audio (just for testing)
            navigator.getUserMedia({video: true, audio: true}, mediaStream => {
                resolve(mediaStream);
            }, error => {
                reject(error);
            });
        });
    }

    private initalizeCanvas(): void {
        const _drawLoop = () => {
            const canvas = this.canvas.nativeElement;

            const ctx = canvas.getContext("2d");

            if (!ctx) {
                throw new Error("Unexpected missing ctx");
            }

            ctx.globalAlpha = 1;
            ctx.fillStyle = "white";
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.font = "30px Arial";

            // firebase
            if (this.controllerMovement2 === 'up') {
                this.ballY2 -= 1;
            } else if (this.controllerMovement2 === 'down') {
                this.ballY2 += 1;
            } else if (this.controllerMovement2 === 'left') {
                this.ballX2 -= 1;
            } else if (this.controllerMovement2 === 'right') {
                this.ballX2 += 1;
            }

            if (this.showBlue) {
                ctx.globalAlpha = .6;

                ctx.beginPath();
                ctx.arc(this.ballX2, this.ballY2, 30, 0, 2 * Math.PI);
                ctx.fillStyle = "blue";
                ctx.fill();
                // ctx.stroke();

                ctx.globalAlpha = .87;
                ctx.fillStyle = "black";

                if (this.controllerMovement2 === 'drop') {
                    ctx.fillText("D", this.ballX2 - 10, this.ballY2 + 10);
                }
            }

            // peerjs
            if (this.controllerMovement === 'up') {
                this.ballY -= 1;
            } else if (this.controllerMovement === 'down') {
                this.ballY += 1;
            } else if (this.controllerMovement === 'left') {
                this.ballX -= 1;
            } else if (this.controllerMovement === 'right') {
                this.ballX += 1;
            }

            if (this.showRed) {
                ctx.globalAlpha = .6;

                ctx.beginPath();
                ctx.arc(this.ballX, this.ballY, 30, 0, 2 * Math.PI);
                ctx.fillStyle = "red";
                ctx.fill();
                // ctx.stroke();

                ctx.globalAlpha = .87;
                ctx.fillStyle = "black";

                if (this.controllerMovement === 'drop') {
                    ctx.fillText("D", this.ballX - 10, this.ballY + 10);
                }
            }

            ctx.strokeRect(0, 0, canvas.width, canvas.height);

            window.requestAnimationFrame(_drawLoop);
        }

        window.requestAnimationFrame(_drawLoop);
    }

    public setMachinePeerID(): void {
        this.firebaseService.setMachineData(this.peerID);
    }

    public handleRequiredInteraction(): void {
        console.error("stub");
        debugger;
        // this.videoService.playAllVideos();
    }

    public initalizePeer() {
        this.peerID = this._getMyMachinePeerID();

        if (!this.peerID) {
            console.warn("Unexpected missing peerID");
            return;
        }

        if (!this.currentPlayerPeerID) {
            console.warn("Unexpected missing current player peerID");
            return;
        }

        if (!this.machineMediaStream) {
            console.warn("Unexpected missing machineMediaStream");
            return;
        }

        if (this.peerWrapper?.peer.destroyed) {
            this.peerWrapper.destroy();
            this.peerWrapper = undefined;
        }
        if (!this.peerWrapper) {
            this.peerWrapper = this.peerjsService.getPeer({
                peerID: this.peerID,
                otherPeerID: this.currentPlayerPeerID,
                onData: (data: ReceiveData) => {
                    this.datas.push(data);
                },
                mediaStream: this.machineMediaStream,
                isCaller: true,
                onError: (error) => {
                    this.errors.push({
                        errorType: error?.type,
                        errorMessage: error?.message,
                    });

                    if (this.peerWrapper?.peer.destroyed) {
                        this.peerWrapper?.destroy();

                        this.initalizePeer();
                    } else {
                        if (!this.peerWrapper?.sentDataConnection?.open) {
                            this.connect();
                        }

                        if (!this.peerWrapper?.sentMediaConnection?.open) {
                            this.call();
                        }
                    }
                },
                onConnectionsDisconnected: () => {
                    // this.connect();
                },
                onDestroy: () => {
                    if (this.peerWrapper?.peer.destroyed) {
                        this.peerWrapper?.destroy();

                        this.initalizePeer();
                    } else {
                        if (!this.peerWrapper?.sentDataConnection?.open) {
                            this.connect();
                        }

                        if (!this.peerWrapper?.sentMediaConnection?.open) {
                            this.call();
                        }
                    }
                },
            });

            this._controllerSub?.unsubscribe();

            this._controllerSub = this.peerWrapper.controllerObservable.subscribe(controllerData => {
                console.log('controllerData', controllerData);

                if (controllerData.value === 'up-pressed') {
                    this.controllerMovement = 'up';
                } else if (controllerData.value === 'down-pressed') {
                    this.controllerMovement = 'down';
                } else if (controllerData.value === 'left-pressed') {
                    this.controllerMovement = 'left';
                } else if (controllerData.value === 'right-pressed') {
                    this.controllerMovement = 'right';
                } else if (controllerData.value === 'drop-pressed') {
                    this.controllerMovement = 'drop';
                } else {
                    this.controllerMovement = 'none';
                }
            });

            this._controllerSub.add(this.firebaseService.getControllerData().subscribe(controllerDataValue => {
                if (controllerDataValue === 'up-pressed') {
                    this.controllerMovement2 = 'up';
                } else if (controllerDataValue === 'down-pressed') {
                    this.controllerMovement2 = 'down';
                } else if (controllerDataValue === 'left-pressed') {
                    this.controllerMovement2 = 'left';
                } else if (controllerDataValue === 'right-pressed') {
                    this.controllerMovement2 = 'right';
                } else if (controllerDataValue === 'drop-pressed') {
                    this.controllerMovement2 = 'drop';
                } else {
                    this.controllerMovement2 = 'none';
                }
            }));
        } else {
            this.peerWrapper.setOtherPeerID(this.currentPlayerPeerID);
        }
    }
    
    public submit(): void {
        const sendFormControl = this.formGroup.get('send');

        if (!sendFormControl) {
            return;
        }

        const message = "" + (sendFormControl.value || '');

        sendFormControl.patchValue('');

        this.peerWrapper?.send({
            dataType: 'message',
            value: message,
        });
    }

    public connect(): void {
        if (!this.peerWrapper) {
            throw Error("Unexpected missing peerWrapper");
        }

        this.peerWrapper.connect();
    }

    public call(): void {
        if (!this.peerWrapper) {
            throw Error("Unexpected missing peerWrapper");
        }

        if (!this.machineMediaStream) {
            throw Error("Missing stream");
        }

        this.peerWrapper.call(this.machineMediaStream);
    }

    public clearDatas(): void {
        this.datas = [];
    }

    public clearErrors(): void {
        this.errors = [];
    }

    private _getMyMachinePeerID(): string {
        const peerID = this.peerID || localStorage.getItem('machine-peer-id') || this.peerjsService.getRandomPeerID();

        localStorage.setItem('machine-peer-id', peerID);

        return peerID;
    }

    public resetBalls(): void {
        this.ballX = 500/2;
        this.ballY = 250/2;
        this.ballX2 = 500/2;
        this.ballY2 = 250/2;
    }

    public toggleRed(): void {
        this.showRed = !this.showRed;
    }

    public toggleBlue(): void {
        this.showBlue = !this.showBlue;
    }

    public ngOnDestroy(): void {
        this.peerWrapper?.destroy();
        
        this._sub?.unsubscribe();

        this._controllerSub?.unsubscribe();
    }
}
