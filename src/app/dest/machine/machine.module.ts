import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { MachineRoutingModule } from './machine-routing.module';
import { MachineComponent } from './machine.component';


@NgModule({
  declarations: [MachineComponent],
  imports: [
    CommonModule,
    MachineRoutingModule
  ]
})
export class MachineModule { }
