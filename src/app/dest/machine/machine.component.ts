import { Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Subscription } from 'rxjs';

import { FirebaseService, MachineData, PrivatePlayerData } from '@app/services/firebase.service';
import { PeerjsService, PeerWrapper, ReceiveData } from '@app/services/peerjs.service';
import { VideoService } from '@app/services/video.service';
import { FormBuilder, FormControl, FormGroup } from '@angular/forms';

@Component({
    selector: 'app-machine',
    templateUrl: './machine.component.html',
    styleUrls: ['./machine.component.scss']
})
export class MachineComponent implements OnInit, OnDestroy {
    @ViewChild('video', {static: true}) private video!: ElementRef<HTMLVideoElement>;

    public formGroup!: FormGroup;

    private _sub?: Subscription;

    public peerID!: string;
    public currentPlayerPeerID?: string;
    public peer?: PeerWrapper;

    public currentPrivatePlayersData: {
        value: PrivatePlayerData | undefined;
        isPending: boolean;
    } = { value: undefined, isPending: true };

    public machineData: {
        value: MachineData | undefined;
        isPending: boolean;
    } = { value: undefined, isPending: true };

    public machineMediaStream?: MediaStream;

    public datas: ReceiveData[] = [];
    
    public errors: {
        errorType?: string;
        errorMessage?: string;
    }[] = [];

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

        navigator.getUserMedia = navigator.getUserMedia || (navigator as any).webkitGetUserMedia || (navigator as any).mozGetUserMedia;
        
        // TODO: Bring back audio (just for testing)
        navigator.getUserMedia({video: true, audio: false}, mediaStream => {
            this.machineMediaStream = mediaStream;
            this.videoService.bindVideoStream(this.video.nativeElement, mediaStream);

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
        });

        this._sub.add(this.firebaseService.getMachineData().subscribe(machine => {
            this.machineData = {
                value: machine,
                isPending: false,
            };
        }));
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

        if (this.peer?.peerState === 'destroyed' || this.peer?.peer.destroyed) {
            this.peer.destroy();
            this.peer = undefined;
        }
        if (!this.peer) {
            this.peer = this.peerjsService.getPeer({
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

                    if (this.peer?.peerState === 'destroyed' || this.peer?.peer.destroyed) {
                        this.peer?.destroy();

                        this.initalizePeer();
                    } else {
                        if (!this.peer?.sentCallConnection?.open) {
                            this.connect();
                        }

                        if (!this.peer?.callConfirmed) {
                            this.call();
                        }
                    }
                },
                onConnectionsDisconnected: () => {
                    // this.connect();
                },
                onDestroy: () => {
                    if (this.peer?.peerState === 'destroyed' || this.peer?.peer.destroyed) {
                        this.peer?.destroy();

                        this.initalizePeer();
                    } else {
                        if (!this.peer?.sentCallConnection?.open) {
                            this.connect();
                        }

                        if (!this.peer?.callConfirmed) {
                            this.call();
                        }
                    }
                },
            });

        } else {
            this.peer.setOtherPeerID(this.currentPlayerPeerID);
        }
    }
    
    public submit(): void {
        const sendFormControl = this.formGroup.get('send');

        if (!sendFormControl) {
            return;
        }

        const message = "" + (sendFormControl.value || '');

        sendFormControl.patchValue('');

        this.peer?.send({
            dataType: 'message',
            value: message,
        });
    }

    public connect(): void {
        if (!this.peer) {
            throw Error("Unexpected missing peer");
        }

        this.peer.connect();
    }

    public call(): void {
        if (!this.peer) {
            throw Error("Unexpected missing peer");
        }

        if (!this.machineMediaStream) {
            throw Error("Missing stream");
        }

        this.peer.call(this.machineMediaStream);
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
        this.peer?.destroy();
        
        this._sub?.unsubscribe();
    }
}
