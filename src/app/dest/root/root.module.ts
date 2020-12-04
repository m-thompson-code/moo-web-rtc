import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { ReactiveFormsModule } from '@angular/forms';

import { RootRoutingModule } from './root-routing.module';
import { RootComponent } from './root.component';

@NgModule({
    declarations: [RootComponent],
    imports: [
        CommonModule,
        RootRoutingModule,
        ReactiveFormsModule,
    ],
    // bootstrap: [RootComponent]
})
export class RootModule { }
