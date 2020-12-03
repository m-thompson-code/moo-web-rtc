// This file can be replaced during build by using the `fileReplacements` array.
// `ng build --prod` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

import { Environment } from './environment.interface';

export const environment: Environment = {
    env: 'dev',
    firebaseConfig: {
        apiKey: "AIzaSyDru9EitiEw1l0flI5qACU0-TQEHFHdxfU",
        authDomain: "moo-web-rtc-staging.firebaseapp.com",
        projectId: "moo-web-rtc-staging",
        storageBucket: "moo-web-rtc-staging.appspot.com",
        messagingSenderId: "208235903088",
        appId: "1:208235903088:web:1f375bd98486447808dcb5",
        measurementId: "G-Z0N7KM1K4H"
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
