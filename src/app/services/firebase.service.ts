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
// // import 'firebase/database';
// import 'firebase/firestore';
// // import 'firebase/storage';
// // import 'firebase/messaging';
// // import 'firebase/functions';

// import { environment } from '@environment';

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
}

const PUBLIC_PLAYERS_COL = 'public_players';
const PRIVATE_PLAYERS_COL = 'private_players';

@Injectable({
    providedIn: 'root'
})
export class FirebaseService {

    constructor(private authService: AuthService, private firestore: AngularFirestore) { }

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
        };

        batch.set(privatePlayerRef, privateData);

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
            const player: PublicPlayerData | undefined = this._rawDataToPublicPlayerData(doc);

            return player;
        }));
    }

    public getPublicPlayers(): Observable<PublicPlayerData[]> {
        return this.firestore.collection<RawPublicPlayerData>(PUBLIC_PLAYERS_COL, ref => ref.where('active', '==', true).orderBy('createdAtTimestamp')).valueChanges({idField: 'uid'}).pipe(map(collection => {
            const players: PublicPlayerData[] = [];

            for (const doc of collection) {
                console.log(doc);

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
        };

        return privatePlayerData;
    }

    public getPrivatePlayer(uid: string): Observable<PrivatePlayerData | undefined> {
        return this.firestore.collection<RawPrivatePlayerData>(PRIVATE_PLAYERS_COL).doc(uid).valueChanges({idField: 'uid'}).pipe(map(doc => {
            const player: PrivatePlayerData | undefined = this._rawDataToPrivatePlayerData(doc);

            return player;
        }));
    }
    
    public getPrivatePlayers(): Observable<PrivatePlayerData[]> {
        return this.firestore.collection<RawPrivatePlayerData>(PRIVATE_PLAYERS_COL, ref => ref.where('active', '==', true).orderBy('createdAtTimestamp')).valueChanges({idField: 'uid'}).pipe(map(collection => {
            const players: PrivatePlayerData[] = [];

            for (const doc of collection) {
                console.log(doc);

                const player = this._rawDataToPrivatePlayerData(doc);

                if (player) {
                    players.push(player);
                }
            }

            return players;
        }));
    }
}
