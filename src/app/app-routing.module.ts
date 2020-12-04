import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

const routes: Routes = [
    {
        path: '',
        loadChildren: () => import('./dest/root/root.module').then(mod => mod.RootModule),
    },
    {
        path: 'machine',
        loadChildren: () => import('./dest/machine/machine.module').then(mod => mod.MachineModule),
    },
    {
        path: 'admin',
        loadChildren: () => import('./dest/admin/admin.module').then(mod => mod.AdminModule),
    },
];

@NgModule({
    imports: [RouterModule.forRoot(routes)],
    exports: [RouterModule]
})
export class AppRoutingModule { }
