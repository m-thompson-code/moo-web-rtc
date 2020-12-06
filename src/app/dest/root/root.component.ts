import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, FormControl, FormGroup } from '@angular/forms';
import { Subscription } from 'rxjs';

import firebase from 'firebase/app';

import { AuthService } from '@app/services/auth.service';
import { FirebaseService, MachineData, PrivatePlayerData, PublicPlayerData } from '@app/services/firebase.service';
import { PeerjsService, PeerWrapper } from '@app/services/peerjs.service';
import { VideoService } from '@app/services/video.service';

import * as faker from 'faker';

@Component({
    selector: 'app-root',
    templateUrl: './root.component.html',
    styleUrls: ['./root.component.scss']
})
export class RootComponent implements OnInit, OnDestroy {
    @ViewChild('machineVideo', {static: true}) private machineVideo!: ElementRef<HTMLVideoElement>;

    public formGroup!: FormGroup;
    public setPlayerFormGroup!: FormGroup;

    public peerID: string = "";
    public peer?: PeerWrapper;

    public datas: {
        peerID: string;
        value: string;
        timestamp: number;
    }[] = [];

    public machineStream?: MediaStream;

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
    private peerjsService: PeerjsService, public videoService: VideoService, private authService: AuthService) {
        
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

            if (this.currentPublicPlayerData.value?.uid !== this.myPrivatePlayerData.value?.uid) {
                this.peer?.disconnectConnections();
            } else {
                if (this.machineData.value) {
                    this.peer?.setOtherPeerID(this.machineData.value.peerID);
                }
            }
        }));

        this._sub.add(this.firebaseService.getMachineData().subscribe(machine => {
            this.machineData = {
                value: machine,
                isPending: false,
            };

            if (this.machineData.value) {
                this.peer?.setOtherPeerID(this.machineData.value.peerID);
            }
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
                    this.initalizePeer(this.myPrivatePlayerData.value?.peerID);
                } else {
                    this.peer?.destroy();
                }
            });
        }
    }
    
    public initalizePeer(peerID: string): void {
        this.peerID = peerID;

        if (this.peer) {
            this.peer.destroy();
        }

        this.peer = this.peerjsService.getPeer({
            peerID: peerID,
            otherPeerID: this.machineData.value?.peerID,
            onData: (data: any, peerID: string) => {
                this.datas.push({
                    peerID: peerID,
                    value: data.value,
                    timestamp: Date.now(),
                });
            },
            onCall: (conn, stream) => {
                console.log(conn, stream);

                if (this.machineStream) {
                    this.videoService.removeVideoStream(this.machineStream, this.machineVideo.nativeElement);
                }

                this.machineStream = stream;
                
                this.videoService.pushPendingVideo(this.machineVideo.nativeElement);
                this.videoService.bindVideoStream(this.machineVideo.nativeElement, stream);
            },
            onCallConnectionClosed: () => {
                if (this.machineStream) {
                    this.videoService.removeVideoStream(this.machineStream, this.machineVideo.nativeElement);
                }
            },
        });
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
        if (!this.machineData.value?.peerID) {
            console.warn("Unexpected missing machine peerID");
            return;
        }

        this.peer?.connect(this.machineData.value.peerID);
    }

    public ngOnDestroy(): void {
        this.peer?.destroy();
        
        this._sub?.unsubscribe();
        this._sub2?.unsubscribe();
        this._sub3?.unsubscribe();
    }
}
