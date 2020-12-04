import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, FormControl, FormGroup } from '@angular/forms';
import { FirebaseService, PublicPlayerData } from '@app/services/firebase.service';
import { PeerjsService } from '@app/services/peerjs.service';
import { VideoService } from '@app/services/video.service';
import { Subscription } from 'rxjs';

@Component({
    selector: 'app-root',
    templateUrl: './root.component.html',
    styleUrls: ['./root.component.scss']
})
export class RootComponent implements OnInit, OnDestroy {
    @ViewChild('myVideo', {static: true}) private myVideo!: ElementRef<HTMLVideoElement>;
    @ViewChild('theirVideo', {static: true}) private theirVideo!: ElementRef<HTMLVideoElement>;

    
    public formGroup!: FormGroup;

    // public peer?: Peer;
    // public conn?:Peer.DataConnection;
    // public peerConn?: Peer.DataConnection;
    // public callConn?: Peer.MediaConnection;

    public myID: string = "";
    public otherID: string = "";

    // public debugLevel: 0 | 1 | 2 | 3 = 0;

    public datas: {
        peerID: string;
        value: string;
        timestamp: number;
    }[] = [];

    public myStream?: MediaStream;

    public theirStream?: MediaStream;

    private _sub?: Subscription;

    public publicPlayersData: {
        value: PublicPlayerData[];
        isPending: boolean;
    } = { value: [], isPending: true };

    constructor(private fb: FormBuilder, private firebaseService: FirebaseService, 
        public peerjsService: PeerjsService, public videoService: VideoService) { }

    public ngOnInit(): void {
        this._init();

        this.formGroup = this.fb.group({
            'send': new FormControl({
                value: 'hello world',
                disabled: false,
            }),
        });

        // const f = this.firebaseService.init();

        // console.log(f);

        const oldID: any = sessionStorage.getItem('my-id');

        if (oldID) {
            this.getPeer(oldID);
        }
    }

    public _init(): void {
        
        this.publicPlayersData = {
            value: [],
            isPending: true,
        };

        this._sub = this.firebaseService.getPublicPlayers().subscribe(publicPlayers => {
            this.publicPlayersData = {
                value: publicPlayers,
                isPending: false,
            };
        });
    }
    
    public getPeer(peerID: string): void {
        const onOpen = () => {
            this.peerjsService.connect();
        };

        this.peerjsService.getPeer(peerID, {
            onOpen: onOpen,
            onData: (data: any, peerID: string) => {
                this.datas.push({
                    peerID: peerID,
                    value: data,
                    timestamp: Date.now(),
                });
            }
        });
    }

    public call(): void {
        this.peerjsService.call(this.peerjsService.peerID === 'moocow-a' ? 'moocow-b' : 'moocow-a')
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

    public addUser(): Promise<void> {
        const playerData = {
            username: 'myusername',
            peerID: 'mypeerID',
            phoneNumber: 'myPhoneNumber',
            emailAddress: 'myEmail',
            shippingAddress: 'myShippingAddress',
        };

        return this.firebaseService.addUser({
            username: playerData.username,
            peerID: playerData.peerID,
            phoneNumber: playerData.phoneNumber,
            emailAddress: playerData.emailAddress,
            shippingAddress: playerData.shippingAddress,
        });
    }

    public handleRequiredInteraction(): void {
        this.videoService.playAllVideos();
        this.videoService.handledRequiredInteraction = true;
    }

    public ngOnDestroy(): void {
        this._sub?.unsubscribe();
    }
}
