// xml-viewer.component.ts
import { FlatTreeControl } from '@angular/cdk/tree';
import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  Input,
  OnInit,
  ViewChild,
} from '@angular/core';
import {
  MatTreeFlatDataSource,
  MatTreeFlattener,
} from '@angular/material/tree';
import { FormControl } from '@angular/forms';
import {
  BehaviorSubject,
  debounceTime,
  distinctUntilChanged,
  map,
  merge,
  Observable,
} from 'rxjs';
import { MatPaginator } from '@angular/material/paginator';
import { CollectionViewer } from '@angular/cdk/collections';

class CustomTreeDataSource {
  private _data: XmlNode[] = [];
  private _flatData: XmlFlatNode[] = [];
  private paginator?: MatPaginator;
  private dataSubject = new BehaviorSubject<XmlFlatNode[]>([]);
  private expandedNodesSet = new Set<string>();

  connect(): Observable<XmlFlatNode[]> {
    return this.dataSubject.asObservable();
  }

  disconnect() {
    this.dataSubject.complete();
  }

  toggleNode(node: XmlFlatNode) {
    const nodeId = this.getNodeId(node);
    if (this.expandedNodesSet.has(nodeId)) {
      this.expandedNodesSet.delete(nodeId);
    } else {
      this.expandedNodesSet.add(nodeId);
    }

    // Aktualisiere die flache Datenstruktur mit dem neuen Expansionszustand
    this._flatData = this.flattenData(this._data);
    this.updatePage();
  }

  isExpanded(node: XmlFlatNode): boolean {
    return this.expandedNodesSet.has(this.getNodeId(node));
  }

  private getNodeId(node: XmlFlatNode): string {
    return `${node.level}-${node.name}-${node.value}`;
  }

  setData(data: XmlNode[]) {
    this._data = data;
    this._flatData = this.flattenData(data);
    this.updatePage();
  }

  private flattenData(
    nodes: XmlNode[],
    level: number = 0,
    parentPath: string = ''
  ): XmlFlatNode[] {
    const result: XmlFlatNode[] = [];

    nodes.forEach((node, index) => {
      const currentPath = parentPath ? `${parentPath}-${index}` : `${index}`;
      const flatNode: XmlFlatNode = {
        expandable: !!node.children && node.children.length > 0,
        name: node.name,
        value: node.value || '',
        attributes: node.attributes || {},
        level,
      };

      result.push(flatNode);

      // Füge Kinder nur hinzu, wenn der Node expandiert ist
      if (
        node.children &&
        node.children.length > 0 &&
        (this.expandedNodesSet.has(this.getNodeId(flatNode)) ||
          this.isSearchActive)
      ) {
        result.push(...this.flattenData(node.children, level + 1, currentPath));
      }
    });

    return result;
  }

  private isSearchActive = false;

  setPaginator(paginator: MatPaginator) {
    this.paginator = paginator;
    paginator.length = this._flatData.length;
    paginator.pageIndex = 0;
    this.updatePage();

    paginator.page.subscribe(() => {
      this.updatePage();
    });
  }

  private updatePage() {
    if (this.paginator) {
      const startIndex = this.paginator.pageIndex * this.paginator.pageSize;
      const endIndex = startIndex + this.paginator.pageSize;
      this.paginator.length = this._flatData.length;
      this.dataSubject.next(this._flatData.slice(startIndex, endIndex));
    } else {
      this.dataSubject.next(this._flatData);
    }
  }
}

export interface XmlNode {
  name: string;
  value?: string;
  attributes?: { [key: string]: string };
  children?: XmlNode[];
}

export interface XmlFlatNode {
  expandable: boolean;
  name: string;
  value: string;
  attributes?: { [key: string]: string };
  level: number;
}

@Component({
  selector: 'app-xml-viewer',
  templateUrl: './xml-viewer.component.html',
  styleUrls: ['./xml-viewer.component.scss'],
})
export class XmlViewerComponent implements OnInit, AfterViewInit {
  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @Input() xmlData: string = '';

  displayedColumns: string[] = ['name', 'value'];
  searchControl = new FormControl('');
  objectKeys = Object.keys;
  originalData: XmlNode[] = [];
  pageSize = 10;
  pageSizeOptions = [5, 10, 25, 50, 100];

  filteredData: XmlNode[] = [];
  customDataSource: CustomTreeDataSource;

  private transformer = (node: XmlNode, level: number): XmlFlatNode => ({
    expandable: !!node.children && node.children.length > 0,
    name: node.name,
    value: node.value || '',
    attributes: node.attributes || {},
    level: level,
  });

  treeControl = new FlatTreeControl<XmlFlatNode>(
    (node) => node.level,
    (node) => node.expandable
  );

  constructor(private changeDetector: ChangeDetectorRef) {
    this.customDataSource = new CustomTreeDataSource();
  }

  expandedNodes = new Set<string>();
  toggleNode(node: XmlFlatNode) {
    this.customDataSource.toggleNode(node);
  }

  isExpanded(node: XmlFlatNode): boolean {
    return this.customDataSource.isExpanded(node);
  }

  hasChildren(node: XmlFlatNode): boolean {
    return node.expandable;
  }

  ngOnInit() {
    this.searchControl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged())
      .subscribe((searchTerm) => {
        if (!searchTerm) {
          this.customDataSource.setData(this.originalData);
        } else {
          this.filterNodes(searchTerm);
        }
      });

    // Initial XML processing if available
    if (this.xmlData) {
      this.processXmlData(this.xmlData);
    }
  }

  ngAfterViewInit() {
    if (this.paginator) {
      this.customDataSource.setPaginator(this.paginator);
      // Fix for ExpressionChangedAfterItHasBeenCheckedError
      this.changeDetector.detectChanges();
    }
  }

  private processXmlData(xmlString: string) {
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
      const treeData = this.convertXmlToTreeData(xmlDoc.documentElement);
      this.originalData = treeData.children || [];
      this.customDataSource.setData(this.originalData);
    } catch (error) {
      console.error('Error processing XML:', error);
    }
  }

  treeFlattener = new MatTreeFlattener(
    this.transformer,
    (node) => node.level,
    (node) => node.expandable,
    (node) => node.children || []
  );

  private convertXmlToTreeData(node: Element): XmlNode {
    const result: XmlNode = {
      name: node.tagName,
      attributes: {},
      children: [],
    };

    // Attribute verarbeiten
    Array.from(node.attributes || []).forEach((attr) => {
      if (result.attributes) {
        result.attributes[attr.name] = attr.value;
      }
    });

    // Text-Inhalt und Kinder verarbeiten
    const childElements = Array.from(node.children || []);
    const textContent = Array.from(node.childNodes)
      .filter((child) => child.nodeType === Node.TEXT_NODE)
      .map((child) => child.textContent?.trim())
      .filter((text) => text)
      .join(' ');

    if (textContent) {
      result.value = textContent;
    }

    if (childElements.length > 0) {
      result.children = childElements.map((child) =>
        this.convertXmlToTreeData(child as Element)
      );
    }

    return result;
  }

  hasChild = (_: number, node: XmlFlatNode) => node.expandable;

  filterNodes(searchTerm: string) {
    if (!searchTerm.trim()) {
      this.customDataSource.setData(this.originalData);
      return;
    }

    const term = searchTerm.toLowerCase();
    const filteredData = this.filterTreeByPredicate(
      [...this.originalData],
      (node) => {
        // Prüfe Node-Namen
        if (node.name.toLowerCase().includes(term)) return true;

        // Prüfe Node-Wert
        if (node.value?.toLowerCase().includes(term)) return true;

        return false;
      }
    );

    this.customDataSource.setData(filteredData);

    setTimeout(() => {
      this.treeControl.expandAll();
    });
  }

  isHighlighted(text: string): boolean {
    const searchTerm = this.searchControl.value;
    return searchTerm
      ? text.toLowerCase().includes(searchTerm.toLowerCase())
      : false;
  }

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value
      .trim()
      .toLowerCase();
    // Implementieren Sie hier die Filterlogik
  }

  private filterNodeRecursively(
    nodes: XmlNode[],
    searchTerm: string
  ): XmlNode[] {
    return nodes.reduce((acc: XmlNode[], node) => {
      const matchesSearch = this.nodeMatchesSearch(node, searchTerm);
      const hasMatchingChildren = node.children?.some((child) =>
        this.nodeOrChildrenMatchSearch(child, searchTerm)
      );

      if (matchesSearch || hasMatchingChildren) {
        const filteredNode: XmlNode = { ...node };

        if (node.children) {
          filteredNode.children = this.filterNodeRecursively(
            node.children,
            searchTerm
          );
          if (filteredNode.children.length > 0) {
            // Expandiere den Pfad zu gefundenen Nodes
            this.expandPath(node);
          }
        }

        acc.push(filteredNode);
      }

      return acc;
    }, []);
  }

  private nodeMatchesSearch(node: XmlNode, searchTerm: string): boolean {
    return (
      node.name.toLowerCase().includes(searchTerm) ||
      (node.value?.toLowerCase().includes(searchTerm) ?? false) ||
      Object.entries(node.attributes || {}).some(
        ([key, value]) =>
          key.toLowerCase().includes(searchTerm) ||
          value.toLowerCase().includes(searchTerm)
      )
    );
  }

  private nodeOrChildrenMatchSearch(
    node: XmlNode,
    searchTerm: string
  ): boolean {
    if (this.nodeMatchesSearch(node, searchTerm)) {
      return true;
    }

    return (
      node.children?.some((child) =>
        this.nodeOrChildrenMatchSearch(child, searchTerm)
      ) ?? false
    );
  }

  private expandPath(node: XmlNode) {
    let currentNode = node;
    while (currentNode) {
      const flatNode = this.findFlatNode(currentNode);
      if (flatNode) {
        this.treeControl.expand(flatNode);
      }
      // Hier müssten Sie die Parent-Referenz haben
      // currentNode = currentNode.parent;
    }
  }

  private findFlatNode(node: XmlNode): XmlFlatNode | null {
    return (
      this.treeControl.dataNodes.find(
        (flatNode) =>
          flatNode.name === node.name &&
          flatNode.value === node.value &&
          this.compareAttributes(flatNode.attributes, node.attributes)
      ) || null
    );
  }

  private compareAttributes(
    attrs1: { [key: string]: string } | undefined,
    attrs2: { [key: string]: string } | undefined
  ): boolean {
    if (!attrs1 && !attrs2) return true;
    if (!attrs1 || !attrs2) return false;

    const keys1 = Object.keys(attrs1);
    const keys2 = Object.keys(attrs2);

    if (keys1.length !== keys2.length) return false;

    return keys1.every((key) => attrs1[key] === attrs2[key]);
  }

  // Beispiel für einen spezifischen Node-Filter

  // Beispiel für einen kombinierten Filter
  filterByNodeNameAndAttribute(nodeName: string, attributeName: string) {
    const searchTerm = `${nodeName}[${attributeName}]`;
    this.searchControl.setValue(searchTerm);
  }

  // Beispiel für einen erweiterten Filter mit Syntax
  parseAndApplyFilter(filterExpression: string) {
    // Beispiel für eine einfache Filtersyntax:
    // node:name - Suche nach Node-Namen
    // attr:name - Suche nach Attributnamen
    // value:text - Suche nach Werten
    const [type, term] = filterExpression.split(':');

    switch (type) {
      case 'node':
        this.filterNodes(term);
        break;
      case 'attr':
        this.filterByAttribute(term);
        break;
      case 'value':
        this.filterByValue(term);
        break;
      default:
        this.filterNodes(filterExpression);
    }
  }

  /**
   * Filtert Nodes nach ihrem Namen
   */
  filterByNodeName(nodeName: string) {
    if (!nodeName.trim()) {
      this.customDataSource.setData(this.originalData);
      return;
    }

    const searchTerm = nodeName.toLowerCase();
    const filteredData = this.filterTreeByPredicate(
      this.originalData,
      (node) => {
        return node.name.toLowerCase().includes(searchTerm);
      }
    );

    this.customDataSource.setData(filteredData);
  }

  /**
   * Filtert Nodes nach Attributnamen oder Attributwerten
   */
  filterByAttribute(attributeSearch: string) {
    if (!attributeSearch.trim()) {
      this.customDataSource.setData(this.originalData);
      return;
    }

    const searchTerm = attributeSearch.toLowerCase();
    const filteredData = this.filterTreeByPredicate(
      this.originalData,
      (node) => {
        if (!node.attributes) return false;

        return Object.entries(node.attributes).some(
          ([key, value]) =>
            key.toLowerCase().includes(searchTerm) ||
            value.toLowerCase().includes(searchTerm)
        );
      }
    );

    this.customDataSource.setData(filteredData);
  }

  /**
   * Filtert Nodes nach ihren Werten
   */
  filterByValue(valueSearch: string) {
    if (!valueSearch.trim()) {
      this.customDataSource.setData(this.originalData);
      return;
    }

    const searchTerm = valueSearch.toLowerCase();
    const filteredData = this.filterTreeByPredicate(
      this.originalData,
      (node: any) => {
        return node.value?.toLowerCase().includes(searchTerm);
      }
    );

    this.customDataSource.setData(filteredData);
  }

  /**
   * Generische Filterfunktion, die einen Predicate für die Filterung verwendet
   */
  private filterTreeByPredicate(
    nodes: XmlNode[],
    predicate: (node: XmlNode) => boolean
  ): XmlNode[] {
    return nodes.reduce((filtered: XmlNode[], node) => {
      const matches = predicate(node);

      if (matches) {
        // Wenn der Node matched, nimm ihn komplett mit allen Kindern
        filtered.push({ ...node });
      } else if (node.children && node.children.length > 0) {
        // Wenn der Node selbst nicht matched, prüfe seine Kinder
        const filteredChildren = this.filterTreeByPredicate(
          node.children,
          predicate
        );
        if (filteredChildren.length > 0) {
          // Wenn Kinder gefunden wurden, nimm den Parent-Node mit den gefilterten Kindern
          filtered.push({
            ...node,
            children: filteredChildren,
          });
        }
      }

      return filtered;
    }, []);
  }
  /**
   * Hilfsfunktion zum Zurücksetzen des Filters
   */
  resetFilter() {
    this.customDataSource.setData(this.originalData);
    this.expandedNodes.clear();
    this.searchControl.setValue('');
  }
  // Beispiel für die Verwendung im Template:
  // <button (click)="filterByNodeName('party')">Show Parties</button>
  // <button (click)="filterByNodeNameAndAttribute('party', 'id')">Show Parties with ID</button>
}
