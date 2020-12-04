import { Component, OnDestroy, OnInit } from '@angular/core';
import { FirebaseService, PrivatePlayerData } from '@app/services/firebase.service';
import { Subscription } from 'rxjs';

@Component({
    selector: 'app-admin',
    templateUrl: './admin.component.html',
    styleUrls: ['./admin.component.scss']
})
export class AdminComponent implements OnInit, OnDestroy {
    private _sub?: Subscription;

    public privatePlayersData: {
        value: PrivatePlayerData[];
        isPending: boolean;
    } = { value: [], isPending: true };

    constructor(private firebaseService: FirebaseService) {

    }

    public ngOnInit(): void {
        this._init();
    }

    
    public _init(): void {
        this.privatePlayersData = {
            value: [],
            isPending: true,
        };

        this._sub = this.firebaseService.getPrivatePlayers().subscribe(privatePlayers => {
            this.privatePlayersData = {
                value: privatePlayers,
                isPending: false,
            };
        });
    }

    public ngOnDestroy(): void {
        this._sub?.unsubscribe();
    }
}
