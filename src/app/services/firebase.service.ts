import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { map } from 'rxjs/operators';

import { AngularFirestore } from '@angular/fire/firestore';
import { environment } from '@environment';

// import { AngularFireAuth } from '@angular/fire/auth';

import firebase from 'firebase/app';

// // import 'firebase/analytics';
import 'firebase/auth';

import { AuthService } from './auth.service';
import { ControllerDataValue, PeerjsService, Util } from './peerjs.service';
import { AngularFireDatabase } from '@angular/fire/database';
import { utils } from 'protractor';
// // import 'firebase/database';
// import 'firebase/firestore';
// // import 'firebase/storage';
// // import 'firebase/messaging';
// // import 'firebase/functions';

// import { environment } from '@environment';

export interface WriteMachineData {
    peerID: string;
    updatedAtTimestamp: firebase.firestore.FieldValue;
}

export interface RawMachineData {
    peerID: string;
    updatedAtDate: firebase.firestore.Timestamp;
}

export interface MachineData {
    peerID: string;
    updatedAtDate: firebase.firestore.Timestamp;
}

export interface RawControllerData {
    controllerDataValue: string;
    updatedAtDate: firebase.firestore.Timestamp;
}

export interface WritePublicPlayerData {
    username: string;
    active: boolean;

    createdAtTimestamp: firebase.firestore.FieldValue;
    updatedAtTimestamp: firebase.firestore.FieldValue;
}

export interface RawPublicPlayerData {
    username: string;
    active: boolean;

    createdAtTimestamp?: firebase.firestore.Timestamp;
    updatedAtTimestamp?: firebase.firestore.Timestamp;
}

export interface WritePrivatePlayerData {
    username: string;
    active: boolean;

    createdAtTimestamp: firebase.firestore.FieldValue;
    updatedAtTimestamp: firebase.firestore.FieldValue;

    peerID: string;
    phoneNumber: string;
    emailAddress: string;
    shippingAddress: string;

    util: Util;
}

export interface RawPrivatePlayerData extends RawPublicPlayerData {
    username: string;
    active: boolean;

    createdAtTimestamp?: firebase.firestore.Timestamp;
    updatedAtTimestamp?: firebase.firestore.Timestamp;

    peerID: string;
    phoneNumber: string;
    emailAddress: string;
    shippingAddress: string;

    util: Util;
}

export interface PublicPlayerData {
    uid: string;

    username: string;
    active: boolean;

    createdAtDate?: Date;// timestamps are handled by Firebase directly, and when these values are updated, they can become null
    updatedAtDate?: Date;// timestamps are handled by Firebase directly, and when these values are updated, they can become null
}

export interface PrivatePlayerData extends PublicPlayerData {
    uid: string;

    username: string;
    active: boolean;

    createdAtDate?: Date;// timestamps are handled by Firebase directly, and when these values are updated, they can become null
    updatedAtDate?: Date;// timestamps are handled by Firebase directly, and when these values are updated, they can become null

    peerID: string;
    phoneNumber: string;
    emailAddress: string;
    shippingAddress: string;

    util: Util;
}

export interface AddPlayerData {
    username: string;

    peerID: string;
    phoneNumber: string;
    emailAddress: string;
    shippingAddress: string;
}

export interface SetPlayerData {
    username: string;
    active: boolean;

    createdAtTimestamp?: firebase.firestore.Timestamp;// timestamps are handled by Firebase directly, and when these values are updated, they can become null
    updatedAtTimestamp?: firebase.firestore.Timestamp;// timestamps are handled by Firebase directly, and when these values are updated, they can become null

    peerID: string;
    phoneNumber: string;
    emailAddress: string;
    shippingAddress: string;

    util: Util;
}

const PUBLIC_PLAYERS_COL = 'public_players';
const PRIVATE_PLAYERS_COL = 'private_players';

const CURRENT_PUBLIC_PLAYER_COL = 'public_current_player';
const CURRENT_PRIVATE_PLAYER_COL = 'private_current_player';

const MACHINE_COL = 'machine';

const CONTROLLER_COL = 'controller';

@Injectable({
    providedIn: 'root'
})
export class FirebaseService {
    public peerjsService?: PeerjsService;

    constructor(private authService: AuthService, private firestore: AngularFirestore, private database: AngularFireDatabase) { }

    private _getPeerjsService(): PeerjsService {
        if (!this.peerjsService) {
            throw new Error("Unexpected missing peerjsService. Do not inject through constructor, set this value through peerjsService's constructor");
        }

        return this.peerjsService;
    }

    public addUser(playerData: AddPlayerData): Promise<void> {
        const batch = firebase.firestore().batch();

        if (!this.authService.user) {
            console.error("Unexpected missing auth user");
            return Promise.resolve();
        }

        const uid = this.authService.user.uid;

        const publicPlayerRef = firebase.firestore().collection(PUBLIC_PLAYERS_COL).doc(uid);
        const privatePlayerRef = firebase.firestore().collection(PRIVATE_PLAYERS_COL).doc(uid);

        const timestampFieldValue: firebase.firestore.FieldValue = firebase.firestore.FieldValue.serverTimestamp();

        const util = this._getPeerjsService().getUtil();

        const publicData: WritePublicPlayerData = {
            username: playerData.username,
            active: true,
            createdAtTimestamp: timestampFieldValue,
            updatedAtTimestamp: timestampFieldValue,
        };

        batch.set(publicPlayerRef, publicData);

        const privateData: WritePrivatePlayerData = {
            username: publicData.username,
            active: publicData.active,
            createdAtTimestamp: publicData.createdAtTimestamp,
            updatedAtTimestamp: publicData.updatedAtTimestamp,

            peerID: playerData.peerID,
            phoneNumber: playerData.phoneNumber,
            emailAddress: playerData.emailAddress,
            shippingAddress: playerData.shippingAddress,
            
            util: util,
        };

        batch.set(privatePlayerRef, privateData);

        return batch.commit();
    }

    public setCurrentUser(privatePlayerData: PrivatePlayerData): Promise<void> {
        const batch = firebase.firestore().batch();

        if (!this.authService.user) {
            console.error("Unexpected missing auth user");
            return Promise.resolve();
        }

        const currentPublicPlayerRef = firebase.firestore().collection(CURRENT_PUBLIC_PLAYER_COL).doc('current');
        const currentPrivatePlayerRef = firebase.firestore().collection(CURRENT_PRIVATE_PLAYER_COL).doc('current');

        const publicData: WritePublicPlayerData & { uid: string } = {
            uid: privatePlayerData.uid,

            username: privatePlayerData.username,
            active: true,

            createdAtTimestamp: privatePlayerData.createdAtDate as any,
            updatedAtTimestamp: privatePlayerData.updatedAtDate as any,
        };

        batch.set(currentPublicPlayerRef, publicData);

        const util = this._getPeerjsService().getUtil();

        const privateData: WritePrivatePlayerData & { uid: string } = {
            uid: privatePlayerData.uid,

            username: privatePlayerData.username || '',
            active: !!privatePlayerData.active,
            
            createdAtTimestamp: privatePlayerData.createdAtDate as any,
            updatedAtTimestamp: privatePlayerData.updatedAtDate as any,

            peerID: privatePlayerData.peerID,
            phoneNumber: privatePlayerData.phoneNumber,
            emailAddress: privatePlayerData.emailAddress,
            shippingAddress: privatePlayerData.shippingAddress,

            util: util,
        };

        batch.set(currentPrivatePlayerRef, privateData);

        return batch.commit();
    }

    public removeCurrentUser(): Promise<void> {
        const batch = firebase.firestore().batch();

        if (!this.authService.user) {
            console.error("Unexpected missing auth user");
            return Promise.resolve();
        }

        const currentPublicPlayerRef = firebase.firestore().collection(CURRENT_PUBLIC_PLAYER_COL).doc('current');
        const currentPrivatePlayerRef = firebase.firestore().collection(CURRENT_PRIVATE_PLAYER_COL).doc('current');

        batch.delete(currentPublicPlayerRef);

        batch.delete(currentPrivatePlayerRef);

        return batch.commit();
    }

    private _rawDataToPublicPlayerData(data: any): PublicPlayerData | undefined {
        if (!data) {
            return undefined;
        }

        const privatePlayerData: PublicPlayerData = {
            uid: data.uid || '',
            username: data.username || '',
            active: !!data.active,
            createdAtDate: data.createdAtTimestamp?.toDate() || undefined,
            updatedAtDate: data.updatedAtTimestamp?.toDate() || undefined,
        };

        return privatePlayerData;
    }

    public getPublicPlayer(uid: string): Observable<PublicPlayerData | undefined> {
        return this.firestore.collection<RawPublicPlayerData>(PUBLIC_PLAYERS_COL).doc(uid).valueChanges({idField: 'uid'}).pipe(map(doc => {
            // TODO: consider how to avoid using this hack (uid is injected causing doc to never be undefined)
            if (!doc?.username) {
                return undefined;
            }
            
            const player: PublicPlayerData | undefined = this._rawDataToPublicPlayerData(doc);

            return player;
        }));
    }

    public getPublicPlayers(): Observable<PublicPlayerData[]> {
        return this.firestore.collection<RawPublicPlayerData>(PUBLIC_PLAYERS_COL, ref => ref.where('active', '==', true).orderBy('createdAtTimestamp')).valueChanges({idField: 'uid'}).pipe(map(collection => {
            const players: PublicPlayerData[] = [];

            for (const doc of collection) {
                players.push({
                    uid: doc.uid || '',
                    username: doc.username || '',
                    active: !!doc.active,
                    createdAtDate: doc.createdAtTimestamp?.toDate() || undefined,
                    updatedAtDate: doc.updatedAtTimestamp?.toDate() || undefined,
                });
            }

            return players;
        }));
    }

    private _rawDataToPrivatePlayerData(data: any): PrivatePlayerData | undefined {
        if (!data) {
            return undefined;
        }

        const privatePlayerData: PrivatePlayerData = {
            uid: data.uid || '',
            username: data.username || '',
            active: !!data.active,
            createdAtDate: data.createdAtTimestamp?.toDate() || undefined,
            updatedAtDate: data.updatedAtTimestamp?.toDate() || undefined,

            peerID: data.peerID,
            phoneNumber: data.phoneNumber,
            emailAddress: data.emailAddress,
            shippingAddress: data.shippingAddress,

            util: this._getPeerjsService().rawDataToUtil(data?.util),
        };

        return privatePlayerData;
    }

    public getPrivatePlayer(uid: string): Observable<PrivatePlayerData | undefined> {
        return this.firestore.collection<RawPrivatePlayerData>(PRIVATE_PLAYERS_COL).doc(uid).valueChanges({idField: 'uid'}).pipe(map(doc => {
            // TODO: consider how to avoid using this hack (uid is injected causing doc to never be undefined)
            if (!doc?.username) {
                return undefined;
            }

            const player: PrivatePlayerData | undefined = this._rawDataToPrivatePlayerData(doc);

            return player;
        }));
    }
    
    public getPrivatePlayers(): Observable<PrivatePlayerData[]> {
        return this.firestore.collection<RawPrivatePlayerData>(PRIVATE_PLAYERS_COL, ref => ref.where('active', '==', true).orderBy('createdAtTimestamp')).valueChanges({idField: 'uid'}).pipe(map(collection => {
            const players: PrivatePlayerData[] = [];

            for (const doc of collection) {
                const player = this._rawDataToPrivatePlayerData(doc);

                if (player) {
                    players.push(player);
                }
            }

            return players;
        }));
    }

    public getCurrentPublicPlayer(): Observable<PublicPlayerData | undefined> {
        return this.firestore.collection<RawPublicPlayerData>(CURRENT_PUBLIC_PLAYER_COL).doc('current').valueChanges().pipe(map(doc => {
            const player: PublicPlayerData | undefined = this._rawDataToPublicPlayerData(doc);

            return player;
        }));
    }

    public getCurrentPrivatePlayer(): Observable<PrivatePlayerData | undefined> {
        return this.firestore.collection<RawPrivatePlayerData>(CURRENT_PRIVATE_PLAYER_COL).doc('current').valueChanges().pipe(map(doc => {

            const player: PrivatePlayerData | undefined = this._rawDataToPrivatePlayerData(doc);

            return player;
        }));
    }

    public deactivatePlayer(uid: string): Promise<void> {
        const batch = firebase.firestore().batch();

        if (!this.authService.user) {
            console.error("Unexpected missing auth user");
            return Promise.resolve();
        }

        const publicPlayerRef = firebase.firestore().collection(PUBLIC_PLAYERS_COL).doc(uid);
        const privatePlayerRef = firebase.firestore().collection(PRIVATE_PLAYERS_COL).doc(uid);

        const timestampFieldValue: firebase.firestore.FieldValue = firebase.firestore.FieldValue.serverTimestamp();

        const publicData = {
            active: false,

            updatedAtTimestamp: timestampFieldValue,
        };

        batch.update(publicPlayerRef, publicData);

        const privateData = {
            active: false,

            updatedAtTimestamp: timestampFieldValue,
        };

        batch.set(privatePlayerRef, privateData);

        return batch.commit();
    }
    
    public setMachineData(peerID: string): Promise<void> {
        const batch = firebase.firestore().batch();

        if (!this.authService.user) {
            console.error("Unexpected missing auth user");
            return Promise.resolve();
        }

        const machineRef = firebase.firestore().collection(MACHINE_COL).doc('machine');

        const timestampFieldValue: firebase.firestore.FieldValue = firebase.firestore.FieldValue.serverTimestamp();

        const machineData = {
            peerID: peerID,

            updatedAtTimestamp: timestampFieldValue,
        };

        batch.set(machineRef, machineData);

        return batch.commit();
    }

    private _rawDataToMachineData(data: any): MachineData | undefined {
        const machineData: MachineData = {
            peerID: data?.peerID || '',
            updatedAtDate: data?.updatedAtTimestamp?.toDate() || undefined,
        };

        return machineData;
    }

    public getMachineData(): Observable<MachineData | undefined> {
        return this.firestore.collection<RawMachineData>(MACHINE_COL).doc('machine').valueChanges().pipe(map(doc => {
            const machine: MachineData | undefined = this._rawDataToMachineData(doc);

            return machine;
        }));
    }

    public setControllerData(controllerDataValue: ControllerDataValue): Promise<void> {
        // return this.__firestore_setControllerData(controllerDataValue);
        return this.__database_setControllerData(controllerDataValue);
    }
    private _rawDataToControllerData(data: any): ControllerDataValue | undefined {
        // return this.__firestore__rawDataToControllerData(data);
        return this.__database__rawDataToControllerData(data);
    }

    public getControllerData(): Observable<ControllerDataValue | undefined> {
        // return this.__firestore_getControllerData();
        return this.__database_getControllerData();
    }
    
    private __firestore_setControllerData(controllerDataValue: ControllerDataValue): Promise<void> {
        if (!this.authService.user) {
            console.error("Unexpected missing auth user");
            return Promise.resolve();
        }

        const controllerRef = firebase.firestore().collection(CONTROLLER_COL).doc('controller');

        const timestampFieldValue: firebase.firestore.FieldValue = firebase.firestore.FieldValue.serverTimestamp();

        const controllerData = {
            controllerDataValue: controllerDataValue,
            updatedAtTimestamp: timestampFieldValue,
        };

        return controllerRef.set(controllerData);
    }

    private __firestore__rawDataToControllerData(data: any): ControllerDataValue | undefined {
        const controllerDataValue = data?.controllerDataValue;

        return controllerDataValue;
    }

    private __firestore_getControllerData(): Observable<ControllerDataValue | undefined> {
        return this.firestore.collection<RawControllerData>(CONTROLLER_COL).doc('controller').valueChanges().pipe(map(doc => {
            const controllerDataValue: ControllerDataValue | undefined = this._rawDataToControllerData(doc);

            return controllerDataValue;
        }));
    }

    private __database_setControllerData(controllerDataValue: ControllerDataValue): Promise<void> {
        if (!this.authService.user) {
            console.error("Unexpected missing auth user");
            return Promise.resolve();
        }

        const controllerRef = firebase.database().ref(`${CONTROLLER_COL}/controller`);

        const serverValueTimestamp: Object = firebase.database.ServerValue.TIMESTAMP;

        const controllerData = {
            controllerDataValue: controllerDataValue,
            updatedAtTimestamp: serverValueTimestamp,
        };

        return controllerRef.set(controllerData);
    }
    private __database__rawDataToControllerData(data: any): ControllerDataValue | undefined {
        const controllerDataValue = data?.controllerDataValue;

        return controllerDataValue;
    }

    private __database_getControllerData(): Observable<ControllerDataValue | undefined> {
        return this.database.object(`${CONTROLLER_COL}/controller`).valueChanges().pipe(map(doc => {
            const controllerDataValue: ControllerDataValue | undefined = this.__database__rawDataToControllerData(doc);

            return controllerDataValue;
        }));
    }
}
