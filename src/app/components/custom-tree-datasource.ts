import { CollectionViewer, DataSource } from '@angular/cdk/collections';
import { FlatTreeControl } from '@angular/cdk/tree';
import { MatPaginator } from '@angular/material/paginator';
import {
  MatTreeFlatDataSource,
  MatTreeFlattener,
} from '@angular/material/tree';
import { BehaviorSubject, merge, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { XmlFlatNode, XmlNode } from './xml-viewer/xml-viewer.component';
import { Input } from '@angular/core';
