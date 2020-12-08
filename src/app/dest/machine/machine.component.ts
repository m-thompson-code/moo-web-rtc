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

    public ballX: number = 50;
    public ballY: number = 50;

    public controllerMovement: 'up' | 'down' | 'left' | 'right' | 'drop' | 'none' = 'none';

    constructor(private fb: FormBuilder, private ngZone: NgZone, private peerjsService: PeerjsService, 
        private firebaseService: FirebaseService, public videoService: VideoService) { }

    public ngOnInit(): void {
        this._init();
    }

    private _init(): void {
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

    private _getMediaStream(): Promise<MediaStream> {
        // return Promise.resolve((this.canvas.nativeElement as any).captureStream() as MediaStream);

        return new Promise((resolve, reject) => {
            // this.ngZone.run(() => {});// Do I need this? I don't think I do since this isn't really a 'Promise' anymore due to angular converting Promises to ZoneAwarePromise
            navigator.getUserMedia = navigator.getUserMedia || (navigator as any).webkitGetUserMedia || (navigator as any).mozGetUserMedia;
        
            // TODO: Bring back audio (just for testing)
            navigator.getUserMedia({video: true, audio: false}, mediaStream => {
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

            ctx.fillStyle = "white";
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            if (this.controllerMovement === 'up') {
                this.ballY -= 1;
            } else if (this.controllerMovement === 'down') {
                this.ballY += 1;
            } else if (this.controllerMovement === 'left') {
                this.ballX -= 1;
            } else if (this.controllerMovement === 'right') {
                this.ballX += 1;
            } else if (this.controllerMovement === 'drop') {
                // TODO: handle this
            }

            ctx.beginPath();
            ctx.arc(this.ballX, this.ballY, 30, 0, 2 * Math.PI);
            ctx.stroke();

            ctx.strokeRect(0, 0, canvas.width, canvas.height);

            window.requestAnimationFrame(_drawLoop);
        }

        window.requestAnimationFrame(_drawLoop);
    }

    public setMachinePeerID(): void {
        this.firebaseService.setMachineData(this.peerID);
    }

    public handleRequiredInteraction(): void {
        this.videoService.playAllVideos();
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

    public ngOnDestroy(): void {
        this.peerWrapper?.destroy();
        
        this._sub?.unsubscribe();

        this._controllerSub?.unsubscribe();
    }
}
