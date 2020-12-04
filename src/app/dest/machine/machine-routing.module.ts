import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { MachineComponent } from './machine.component';

const routes: Routes = [
    {
        path: '',
        component: MachineComponent,
    },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class MachineRoutingModule { }
