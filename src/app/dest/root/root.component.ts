import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, FormControl, FormGroup } from '@angular/forms';
import { Subscription } from 'rxjs';

import firebase from 'firebase/app';

import { AuthService } from '@app/services/auth.service';
import { FirebaseService, MachineData, PrivatePlayerData, PublicPlayerData } from '@app/services/firebase.service';
import { PeerjsService } from '@app/services/peerjs.service';
import { VideoService } from '@app/services/video.service';

import * as faker from 'faker';

@Component({
    selector: 'app-root',
    templateUrl: './root.component.html',
    styleUrls: ['./root.component.scss']
})
export class RootComponent implements OnInit, OnDestroy {
    @ViewChild('myVideo', {static: true}) private myVideo!: ElementRef<HTMLVideoElement>;
    @ViewChild('theirVideo', {static: true}) private theirVideo!: ElementRef<HTMLVideoElement>;

    
    public formGroup!: FormGroup;
    public setPlayerFormGroup!: FormGroup;

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
    private _sub2?: Subscription;
    private _sub3?: Subscription;

    public currentPublicPlayerData: {
        value: PublicPlayerData | undefined;
        isPending: boolean;
    } = { value: undefined, isPending: true };

    public publicPlayersData: {
        value: PublicPlayerData[];
        isPending: boolean;
    } = { value: [], isPending: true };

    public myPrivatePlayerData: {
        value?: PrivatePlayerData;
        isPending: boolean;
    } = { value: undefined, isPending: true };

    public machineData: {
        value: MachineData | undefined;
        isPending: boolean;
    } = { value: undefined, isPending: true };

    constructor(private fb: FormBuilder, private firebaseService: FirebaseService, 
    public peerjsService: PeerjsService, public videoService: VideoService, private authService: AuthService) {
        
    }

    public ngOnInit(): void {
        this._init();

        this.formGroup = this.fb.group({
            'send': new FormControl({
                value: 'hello world',
                disabled: false,
            }),
        });

        this.setPlayerFormGroup = this.fb.group({
            'username': new FormControl({
                value: faker.name.findName(),
                disabled: false,
            }),
            'emailAddress': new FormControl({
                value: faker.internet.email(),
                disabled: false,
            }),
            'shippingAddress': new FormControl({
                value: faker.address.streetAddress(true),
                disabled: false,
            }),
            'phoneNumber': new FormControl({
                value: faker.phone.phoneNumber('###-###-####'),
                disabled: false,
            }),
        });

        // const f = this.firebaseService.init();

        // console.log(f);

        // const oldID: any = sessionStorage.getItem('my-id');

        // if (oldID) {
        //     this.getPeer(oldID);
        // }
    }

    public _init(): void {
        
        this.publicPlayersData = {
            value: [],
            isPending: true,
        };

        this._sub?.unsubscribe();

        this._sub = this.firebaseService.getPublicPlayers().subscribe(publicPlayers => {
            this.publicPlayersData = {
                value: publicPlayers,
                isPending: false,
            };
        });
        
        this._sub.add(this.firebaseService.getCurrentPublicPlayer().subscribe(publicPlayer => {
            this.currentPublicPlayerData = {
                value: publicPlayer,
                isPending: false,
            };
        }));

        this._sub2?.unsubscribe();

        this._sub2 = this.authService.onUserChange().subscribe(user => {
            this._updateMyPrivatePlayer(this.authService.user);
        });

        this._updateMyPrivatePlayer(this.authService.user);
    }

    private _updateMyPrivatePlayer(user?: firebase.User | null): void {
        this._sub3?.unsubscribe();

        this.myPrivatePlayerData = {
            value: undefined,
            isPending: false,
        };

        if (user) {
            this._sub3 = this.firebaseService.getPrivatePlayer(user.uid).subscribe(privatePlayer => {
                this.myPrivatePlayerData = {
                    value: privatePlayer,
                    isPending: false,
                };

                if (this.myPrivatePlayerData.value?.peerID) {
                    this.getPeer(this.myPrivatePlayerData.value?.peerID);
                } else {
                    this.peerjsService.destroyPeer();
                }
            });
        }
    }
    
    public getPeer(peerID: string): void {
        const onOpen = () => {
            if (this.machineData.value?.peerID) {
                this.peerjsService.connect(this.machineData.value.peerID);
            }
        };

        this.peerjsService.getPeer(peerID, {
            onOpen: onOpen,
            onData: (data: any, peerID: string) => {
                this.datas.push({
                    peerID: peerID,
                    value: data,
                    timestamp: Date.now(),
                });
            },
            onCall: (conn, stream) => {
                console.log(conn, stream);
                
                this.videoService.pushPendingVideo(this.theirVideo.nativeElement);
                this.videoService.bindVideoStream(this.theirVideo.nativeElement, stream);
            }
        });
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

    public setUser(): Promise<void> {
        const usernameFormControl = this.setPlayerFormGroup.get('username');

        if (!usernameFormControl) {
            throw new Error("Unexpected missing username form control");
        }

        const username = usernameFormControl.value;

        const emailAddressFormControl = this.setPlayerFormGroup.get('emailAddress');

        if (!emailAddressFormControl) {
            throw new Error("Unexpected missing emailAddress form control");
        }

        const emailAddress = emailAddressFormControl.value;

        const shippingAddressFormControl = this.setPlayerFormGroup.get('shippingAddress');

        if (!shippingAddressFormControl) {
            throw new Error("Unexpected missing shippingAddress form control");
        }

        const shippingAddress = shippingAddressFormControl.value;

        const phoneNumberFormControl = this.setPlayerFormGroup.get('phoneNumber');

        if (!phoneNumberFormControl) {
            throw new Error("Unexpected missing phoneNumber form control");
        }

        const phoneNumber = phoneNumberFormControl.value;

        return this.firebaseService.addUser({
            username: username,
            peerID: this.peerjsService.getRandomPeerID(),
            phoneNumber: phoneNumber,
            emailAddress: emailAddress,
            shippingAddress: shippingAddress,
        });
    }

    public handleRequiredInteraction(): void {
        this.videoService.playAllVideos();
        this.videoService.handledRequiredInteraction = true;
    }

    public connect(): void {
        console.error("stub");
        if (!this.machineData.value?.peerID) {
            console.warn("Unexpected missing machine peerID");
            return;
        }

        this.peerjsService.connect(this.machineData.value.peerID);
    }

    public ngOnDestroy(): void {
        this._sub?.unsubscribe();
        this._sub2?.unsubscribe();
        this._sub3?.unsubscribe();
    }
}
