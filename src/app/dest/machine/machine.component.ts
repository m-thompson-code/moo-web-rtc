import { Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Subscription } from 'rxjs';

import { FirebaseService, MachineData, PrivatePlayerData } from '@app/services/firebase.service';
import { PeerjsService } from '@app/services/peerjs.service';
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

    public peerID: string = "";

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

    constructor(private fb: FormBuilder, private ngZone: NgZone, public peerjsService: PeerjsService, 
        private firebaseService: FirebaseService, public videoService: VideoService) { }

    public ngOnInit(): void {
        this._init();
    }

    private _init(): void {
        this.formGroup = this.fb.group({
            'send': new FormControl({
                value: 'hello world',
                disabled: false,
            }),
        });

        this.peerID = this.peerjsService.getRandomPeerID();

        const onOpen = () => {
            this.connect();
        };

        this.peerjsService.getPeer(this.peerID, {
            onOpen: onOpen,
            onData: (data: any, peerID: string) => {
                this.datas.push({
                    peerID: peerID,
                    value: data,
                    timestamp: Date.now(),
                });
            }
        });

        // TODO: prevent calling unless peer is the 'streamer' peer
        navigator.getUserMedia = navigator.getUserMedia || (navigator as any).webkitGetUserMedia || (navigator as any).mozGetUserMedia;
        
        // TODO: Bring back audio (just for testing)
        navigator.getUserMedia({video: true, audio: false}, stream => {
            this.myStream = stream;
            this.videoService.bindVideoStream(this.video.nativeElement, stream);

            if (this.myStream && this.currentPrivatePlayersData.value) {
                this.peerjsService.call(this.currentPrivatePlayersData.value.peerID, this.myStream);                
            }
        }, error => {
            this.ngZone.run(() => {
                console.error(error);
            });
        });

        this._sub = this.firebaseService.getCurrentPrivatePlayer().subscribe(privatePlayer => {
            this.currentPrivatePlayersData = {
                value: privatePlayer,
                isPending: false,
            };

            if (this.myStream && this.currentPrivatePlayersData.value) {
                this.peerjsService.call(this.currentPrivatePlayersData.value.peerID, this.myStream);                
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

        this.peerjsService.send(value, (data: any, peerID: string) => {
            this.datas.push({
                peerID: peerID,
                value: data,
                timestamp: Date.now(),
            });
        });
    }

    public connect(): void {
        if (!this.currentPrivatePlayersData.value?.peerID) {
            console.warn("Unexpected missing player peerID");
            return;
        }

        this.peerjsService.connect(this.currentPrivatePlayersData.value.peerID);

        if (this.myStream && this.currentPrivatePlayersData.value) {
            this.peerjsService.call(this.currentPrivatePlayersData.value.peerID, this.myStream);                
        }
    }

    public ngOnDestroy(): void {
        this._sub?.unsubscribe();
    }
}
