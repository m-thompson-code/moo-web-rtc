import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, FormControl, FormGroup } from '@angular/forms';
import { Subscription } from 'rxjs';

import firebase from 'firebase/app';

import { AuthService } from '@app/services/auth.service';
import { FirebaseService, MachineData, PrivatePlayerData, PublicPlayerData } from '@app/services/firebase.service';
import { ControllerDataValue, PeerjsService, PeerWrapper, ReceiveData } from '@app/services/peerjs.service';
import { VideoService } from '@app/services/video.service';

import * as faker from 'faker';
import { timeout } from 'rxjs/operators';

@Component({
    selector: 'app-root',
    templateUrl: './root.component.html',
    styleUrls: ['./root.component.scss']
})
export class RootComponent implements OnInit, OnDestroy {
    @ViewChild('machineVideo', {static: true}) private machineVideo!: ElementRef<HTMLVideoElement>;

    public formGroup!: FormGroup;
    public setPlayerFormGroup!: FormGroup;

    public peerID?: string;
    public machinePeerID?: string;
    public peerWrapper?: PeerWrapper;

    public datas: ReceiveData[] = [];

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

    public errors: {
        errorType?: string;
        errorMessage?: string;
    }[] = [];

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
                this.peerWrapper?.disconnectConnections();
            } else {
                this.initalizePeer();
            }
        }));

        this._sub.add(this.firebaseService.getMachineData().subscribe(machine => {
            this.machineData = {
                value: machine,
                isPending: false,
            };

            this.machinePeerID = machine?.peerID;

            this.initalizePeer();
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

                this.peerID = this.myPrivatePlayerData.value?.peerID;

                this.initalizePeer();
            });
        }
    }
    
    public initalizePeer(): void {
        if (!this.peerID) {
            console.warn("Unexpected missing peerID");
            return;
        }

        if (!this.machinePeerID) {
            console.warn("Unexpected missing machine peerID");
            return;
        }

        if (this.peerWrapper?.peer.destroyed) {
            this.peerWrapper.destroy();
            this.peerWrapper = undefined;
        }

        if (!this.peerWrapper) {
            this.peerWrapper = this.peerjsService.getPeer({
                peerID: this.peerID,
                otherPeerID: this.machinePeerID,
                onData: (data: ReceiveData) => {
                    this.datas.push(data);
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
                onError: (error) => {
                    this.errors.push({
                        errorType: error?.type,
                        errorMessage: error?.message,
                    });
    
                    if (this.peerWrapper?.peer.destroyed) {
                        this.peerWrapper?.destroy();
    
                        this.initalizePeer();
                    } else if (!this.peerWrapper?.sentMediaConnection?.open) {
                        this.connect();
                    }
                },
                onConnectionsDisconnected: () => {
                    if (this.machineStream) {
                        this.videoService.removeVideoStream(this.machineStream, this.machineVideo.nativeElement);
                    }
                },
                onDestroy: () => {
                    if (this.peerWrapper?.peer.destroyed) {
                        this.peerWrapper?.destroy();
    
                        this.initalizePeer();
                    } else if (!this.peerWrapper?.sentMediaConnection?.open) {
                        this.connect();
                    }
                },
            });
        } else {
            this.peerWrapper.setOtherPeerID(this.machinePeerID);
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

    public handleRequiredInteraction(): Promise<void> {
        const promises: Promise<any>[] = [];

        const timeoutPromise = new Promise((resolve, reject) => {
            const t = window.setTimeout(() => {
                reject("Playing videos timed out");
            }, 10 * 1000);

            promises.push(this.videoService.playAllVideos().then(() => {
                clearTimeout(t);

                resolve();
            }));
        });

        promises.push(timeoutPromise);

        this.videoService.handledRequiredInteraction = true;

        return Promise.all(promises).then(() => {
            console.log("handleRequiredInteraction finished");
            // pass
        }).catch(error => {
            console.error(error);

            debugger;

            // TODO: update UI to show that a retry happened
            
            if (error === "Playing videos timed out") {
                setTimeout(() => {
                    if (!this.peerWrapper) {
                        debugger;
                        throw new Error("Unexpected missing peerWrapper");
                    }

                    this.peerWrapper.requestOtherPeerToCall();
                }, 3000);
            }
        });
    }

    public connect(): void {
        if (!this.currentPublicPlayerData.value || !this.myPrivatePlayerData.value || this.myPrivatePlayerData.value?.uid !== this.currentPublicPlayerData.value?.uid) {
            console.warn("Unexpected current player is this player (based on uid). Aborting connect");
            return;
        }

        if (!this.machineData.value?.peerID) {
            console.warn("Unexpected missing machine peerID. Aborting connect");
            return;
        }

        if (!this.peerWrapper) {
            console.warn("Unexpected missing peerWrapper");
            return;
        }

        this.peerWrapper.connect();
    }

    public clearDatas(): void {
        this.datas = [];
    }

    public clearErrors(): void {
        this.errors = [];
    }

    public sendControllerData(controllerData: ControllerDataValue): void {
        this.peerWrapper?.sendControllerData(controllerData);
    }

    public ngOnDestroy(): void {
        this.peerWrapper?.destroy();
        
        this._sub?.unsubscribe();
        this._sub2?.unsubscribe();
        this._sub3?.unsubscribe();
    }
}
