import { Component, ElementRef, NgZone, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, FormControl, FormGroup } from '@angular/forms';

import { FirebaseService, PublicPlayerData } from './services/firebase.service';

// import Peer from 'peerjs';
// import util from 'peerjs';
import { PeerjsService } from './services/peerjs.service';
import { VideoService } from './services/video.service';
import { AuthService } from './services/auth.service';

import { Subscription } from 'rxjs';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
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

    public initalized: boolean = false;

    private _sub?: Subscription;

    public publicPlayersData: {
        value: PublicPlayerData[];
        isPending: boolean;
    } = { value: [], isPending: true };

    constructor(private fb: FormBuilder, private firebaseService: FirebaseService, public authService: AuthService, 
        public peerjsService: PeerjsService, public videoService: VideoService) {

    }

    public ngOnInit(): void {
        void this._init();

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

    private _init(): Promise<void> {
        this.initalized = false;

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

        return this.authService.init().then(user => {
            console.log(user);

            if (!user) {
                return this.authService.signInAnonymously();
            }

            return;
        }).catch(error => {
            console.error(error);
        }).then(() => {
            this.initalized = true;
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
