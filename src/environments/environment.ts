// This file can be replaced during build by using the `fileReplacements` array.
// `ng build --prod` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

import { Environment } from './environment.interface';

export const environment: Environment = {
    env: 'dev',
    firebaseConfig: {
        apiKey: "AIzaSyC8f0opFNukKc6CcomatCyVNU5-PGwuR7o",
        authDomain: "moo-web-rtc.firebaseapp.com",
        databaseURL: "https://moo-web-rtc.firebaseio.com",
        projectId: "moo-web-rtc",
        storageBucket: "moo-web-rtc.appspot.com",
        messagingSenderId: "429555155753",
        appId: "1:429555155753:web:a96fb158c1fee3f1f5ed38",
        measurementId: "G-3QKJ74T8CX",
    }
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/dist/zone-error';  // Included with Angular CLI.
