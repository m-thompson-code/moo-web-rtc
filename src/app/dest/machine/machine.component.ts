import { Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Subscription } from 'rxjs';

import { FirebaseService, MachineData, PrivatePlayerData } from '@app/services/firebase.service';
import { PeerjsService, PeerWrapper } from '@app/services/peerjs.service';
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
    public peer?: PeerWrapper;

    public currentPrivatePlayersData: {
        value: PrivatePlayerData | undefined;
        isPending: boolean;
    } = { value: undefined, isPending: true };

    public machineData: {
        value: MachineData | undefined;
        isPending: boolean;
    } = { value: undefined, isPending: true };

    public myStream?: MediaStream;

    public datas: {
        peerID: string;
        value: string;
        timestamp: number;
    }[] = [];

    constructor(private fb: FormBuilder, private ngZone: NgZone, private peerjsService: PeerjsService, 
        private firebaseService: FirebaseService, public videoService: VideoService) { }

    public ngOnInit(): void {
        this._init();
    }

    private _init(): void {
        this.peerID = localStorage.getItem('machine-peer-id') || this.peerjsService.getRandomPeerID();

        localStorage.setItem('machine-peer-id', this.peerID);

        this.formGroup = this.fb.group({
            'send': new FormControl({
                value: 'hello world',
                disabled: false,
            }),
        });

        navigator.getUserMedia = navigator.getUserMedia || (navigator as any).webkitGetUserMedia || (navigator as any).mozGetUserMedia;
        
        // TODO: Bring back audio (just for testing)
        navigator.getUserMedia({video: true, audio: false}, mediaStream => {
            if (this.peer) {
                this.peer.destroy();
            }

            this.peer = this.peerjsService.getPeer({
                peerID: this.peerID,
                onData: (data: any, peerID: string) => {
                    this.datas.push({
                        peerID: peerID,
                        value: data,
                        timestamp: Date.now(),
                    });
                },
                mediaStream: mediaStream,
                isCaller: true,
            });

            this.myStream = mediaStream;
            this.videoService.bindVideoStream(this.video.nativeElement, mediaStream);
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

            this.connect();

            if (this.myStream && this.currentPrivatePlayersData.value) {
                this.call();            
            }
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
    
    public submit(): void {
        const sendFormControl = this.formGroup.get('send');

        if (!sendFormControl) {
            return;
        }

        const value = sendFormControl.value;

        sendFormControl.patchValue('');

        this.peer?.send(value);
    }

    public connect(): void {
        if (!this.currentPrivatePlayersData.value?.peerID) {
            console.warn("Unexpected missing player peerID");
            return;
        }

        this.peer?.connect(this.currentPrivatePlayersData.value.peerID);
    }

    public call(): void {
        if (this.myStream && this.currentPrivatePlayersData.value) {
            this.peer?.call(this.currentPrivatePlayersData.value.peerID, this.myStream);                
        } else {
            console.warn("Missing stream and/or otherPeerID");
        }
    }

    public ngOnDestroy(): void {
        this.peer?.destroy();
        this._sub?.unsubscribe();
    }
}
