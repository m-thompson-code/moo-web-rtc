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

export interface RawPublicPlayerData {
    username: string;
    createdAtTimestamp?: firebase.firestore.Timestamp;
    updatedAtTimestamp?: firebase.firestore.Timestamp;
}

export interface PublicPlayerData {
    uid: string;

    username: string;
    createdAtDate?: Date;
    updatedAtDate?: Date;
}

export interface PlayerData extends PublicPlayerData {
    uid: string;

    username: string;
    createdAtDate?: Date;
    updatedAtDate?: Date;

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

const PUBLIC_PLAYERS_COL = 'public_players';
const PRIVATE_PLAYERS_COL = 'private_players';
const PERSISTENT_PLAYERS_COL = 'persistent_players';

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
        const persistentPlayerRef = firebase.firestore().collection(PERSISTENT_PLAYERS_COL).doc(uid);

        const timestampFieldValue: firebase.firestore.FieldValue = firebase.firestore.FieldValue.serverTimestamp();

        batch.set(publicPlayerRef, {
            username: playerData.username,
            state: 'pending',
            createdAtTimestamp: timestampFieldValue,
            updatedAtTimestamp: timestampFieldValue,
        });

        batch.set(privatePlayerRef, {
            username: playerData.username,
            peerID: playerData.peerID,
            phoneNumber: playerData.phoneNumber,
            emailAddress: playerData.emailAddress,
            shippingAddress: playerData.shippingAddress,
            state: 'pending',
            createdAtTimestamp: timestampFieldValue,
            updatedAtTimestamp: timestampFieldValue,
        });

        batch.set(persistentPlayerRef, {
            username: playerData.username,
            peerID: playerData.peerID,
            phoneNumber: playerData.phoneNumber,
            emailAddress: playerData.emailAddress,
            shippingAddress: playerData.shippingAddress,
            state: 'pending',
            createdAtTimestamp: timestampFieldValue,
            updatedAtTimestamp: timestampFieldValue,
        });

        return batch.commit();
    }

    public getPublicPlayers(): Observable<PublicPlayerData[]> {
        return this.firestore.collection<RawPublicPlayerData>(PUBLIC_PLAYERS_COL, ref => ref.orderBy('createdAtTimestamp')).valueChanges({idField: 'uid'}).pipe(map(collection => {
            const players: PublicPlayerData[] = [];

            for (const doc of collection) {
                console.log(doc);

                players.push({
                    uid: doc.uid,
                    username: doc.username,
                    createdAtDate: doc.createdAtTimestamp?.toDate() || undefined,
                    updatedAtDate: doc.updatedAtTimestamp?.toDate() || undefined,
                });
            }

            return players;
        }));
    }
}
