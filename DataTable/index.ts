import { IInputs, IOutputs } from "./generated/ManifestTypes";

interface IColumn {
    name: string;
    displayName: string;
    dataType: string;
    sortable: boolean;
    width?: number;
}

type FilterState = Record<string, string>;

export class DataTable implements ComponentFramework.StandardControl<IInputs, IOutputs> {
    private _container: HTMLDivElement;
    private _context: ComponentFramework.Context<IInputs>;
    private _notifyOutputChanged: () => void;
    
    private _tableElement: HTMLTableElement;
    private _theadElement: HTMLTableSectionElement;
    private _tbodyElement: HTMLTableSectionElement;
    private _filterRow: HTMLTableRowElement;
    private _paginationContainer: HTMLDivElement;
    private _searchContainer: HTMLDivElement;
    private _loadMoreContainer: HTMLDivElement;
    private _infoSection: HTMLDivElement;
    
    private _columns: IColumn[] = [];
    private _records: ComponentFramework.PropertyHelper.DataSetApi.EntityRecord[] = [];
    private _sortedColumn = "";
    private _sortDirection: "asc" | "desc" = "asc";
    private _filters: FilterState = {};
    private _globalSearch = "";
    private _currentPage = 1;
    private _selectedRecordIds: string[] = [];
    private _isTestHarness = false;
    private _highlightColor = "#0078d4";
    private _rowHeight = 40;
    private _searchDebounceTimer: number | null = null;
    
    // Auto-load tracking
    private _lastRecordCount = 0;
    private _loadingStartTime = 0;
    private _consecutiveLoadAttempts = 0;
    private _maxLoadAttempts = 100; // Max 100 pages (5000 records if 50 per page)

    public init(
        context: ComponentFramework.Context<IInputs>,
        notifyOutputChanged: () => void,
        state: ComponentFramework.Dictionary,
        container: HTMLDivElement
    ): void {
        this._context = context;
        this._notifyOutputChanged = notifyOutputChanged;
        this._container = container;
        
        this._highlightColor = context.parameters.highlightColor?.raw || "#0078d4";
        this._rowHeight = context.parameters.rowHeight?.raw || 40;
        
        context.mode.trackContainerResize(true);
        
        this.initializeUI();
        
        console.log("🚀 DataTable PCF initialized");
    }

    private initializeUI(): void {
        this._container.innerHTML = "";
        this._container.className = "pcf-datatable-container";
        
        this._container.style.setProperty('--highlight-color', this._highlightColor);
        this._container.style.setProperty('--row-height', `${this._rowHeight}px`);
        
        this._searchContainer = document.createElement("div");
        this._searchContainer.className = "pcf-toolbar";
        this._container.appendChild(this._searchContainer);
        
        const tableWrapper = document.createElement("div");
        tableWrapper.className = "pcf-table-wrapper";
        
        this._tableElement = document.createElement("table");
        this._tableElement.className = "pcf-datatable";
        
        this._theadElement = document.createElement("thead");
        this._tableElement.appendChild(this._theadElement);
        
        this._tbodyElement = document.createElement("tbody");
        this._tableElement.appendChild(this._tbodyElement);
        
        tableWrapper.appendChild(this._tableElement);
        this._container.appendChild(tableWrapper);
        
        this._loadMoreContainer = document.createElement("div");
        this._loadMoreContainer.className = "pcf-load-more-container";
        this._container.appendChild(this._loadMoreContainer);
        
        this._paginationContainer = document.createElement("div");
        this._paginationContainer.className = "pcf-pagination-container";
        this._container.appendChild(this._paginationContainer);
    }

    public updateView(context: ComponentFramework.Context<IInputs>): void {
        this._context = context;
        
        this._highlightColor = context.parameters.highlightColor?.raw || "#0078d4";
        this._rowHeight = context.parameters.rowHeight?.raw || 40;
        this._container.style.setProperty('--highlight-color', this._highlightColor);
        this._container.style.setProperty('--row-height', `${this._rowHeight}px`);
        
        if (!context.parameters.dataSet) {
            this.renderError("Dataset not configured", 
                "Please configure the control on a view or subgrid.");
            return;
        }
        
        const dataSet = context.parameters.dataSet;
        
        // ============================================
        // KEY FIX: Kiểm tra loading state
        // ============================================
        if (dataSet.loading) {
            console.log("⏳ Dataset is loading...");
            
            // Show loading indicator
            if (this._lastRecordCount === 0) {
                this.renderLoading();
            } else {
                this.showLoadingProgress();
            }
            
            return; // STOP HERE - đợi load xong
        }
        
        // ============================================
        // Data đã load xong
        // ============================================
        console.group(`📊 UpdateView - Data Loaded`);
        
        // Get columns
        const filteredColumns = dataSet.columns
            .filter(col => col.name !== "samplePropertySet" && col.name && col.displayName);
        
        this._columns = (filteredColumns.length > 0 ? filteredColumns : dataSet.columns)
            .filter(col => col.name && col.displayName)
            .map(col => ({
                name: col.name,
                displayName: col.displayName,
                dataType: col.dataType,
                sortable: true,
                width: col.visualSizeFactor || 100
            }));
        
        if (this._columns.length === 0) {
            console.error("❌ No valid columns");
            console.groupEnd();
            this.renderError("No valid columns", 
                "Please add columns to your view.");
            return;
        }
        
        // Get records
        this._records = dataSet.sortedRecordIds.map(id => dataSet.records[id]);
        const currentRecordCount = this._records.length;
        const hasNextPage = dataSet.paging && dataSet.paging.hasNextPage;
        
        console.log(`📦 Current records: ${currentRecordCount}`);
        console.log(`📄 Has next page: ${hasNextPage}`);
        console.log(`🔢 Last count: ${this._lastRecordCount}`);
        console.log(`🔄 Load attempts: ${this._consecutiveLoadAttempts}`);
        
        // ============================================
        // AUTO-LOAD LOGIC
        // ============================================
        
        // Check if we got new records
        const gotNewRecords = currentRecordCount > this._lastRecordCount;
        
        if (gotNewRecords) {
            console.log(`✅ Got ${currentRecordCount - this._lastRecordCount} new records`);
            this._lastRecordCount = currentRecordCount;
            this._consecutiveLoadAttempts = 0; // Reset attempts khi có data mới
        }
        
        // Nếu còn page và chưa vượt quá max attempts
        if (hasNextPage && this._consecutiveLoadAttempts < this._maxLoadAttempts) {
            this._consecutiveLoadAttempts++;
            
            console.log(`🔄 Loading next page (attempt ${this._consecutiveLoadAttempts}/${this._maxLoadAttempts})...`);
            
            // Show progress
            this.showLoadingProgress();
            
            // Load next page - QUAN TRỌNG: Phải check paging tồn tại
            if (dataSet.paging && typeof dataSet.paging.loadNextPage === 'function') {
                // Delay nhỏ để tránh overwhelm server
                setTimeout(() => {
                    try {
                        dataSet.paging.loadNextPage();
                        console.log("✅ loadNextPage() called successfully");
                    } catch (error) {
                        console.error("❌ Error calling loadNextPage:", error);
                        this._consecutiveLoadAttempts = this._maxLoadAttempts; // Stop trying
                    }
                }, 50); // 50ms delay
            } else {
                console.error("❌ Paging or loadNextPage not available");
                this._consecutiveLoadAttempts = this._maxLoadAttempts;
            }
            
            console.groupEnd();
            return; // DON'T render yet, wait for more data
        }
        
        // ============================================
        // All data loaded - Render table
        // ============================================
        
        if (this._consecutiveLoadAttempts >= this._maxLoadAttempts) {
            console.warn(`⚠️ Stopped loading: reached max attempts (${this._maxLoadAttempts})`);
        }
        
        if (!hasNextPage) {
            console.log(`✅ All data loaded! Total records: ${currentRecordCount}`);
        }
        
        console.groupEnd();
        
        this._isTestHarness = context.mode.allocatedHeight === -1;
        
        // Clear loading indicator
        this._loadMoreContainer.innerHTML = "";
        
        // Render UI
        if (!this._infoSection) {
            this.renderToolbar();
        } else {
            this.updateInfoSection();
        }
        
        this.renderTable();
    }

    private showLoadingProgress(): void {
        this._loadMoreContainer.innerHTML = `
            <div class="pcf-load-more-wrapper">
                <div class="pcf-loading-more">
                    <div class="pcf-spinner-small"></div>
                    <span>Loading all records... (${this._lastRecordCount} loaded)</span>
                </div>
                <div class="pcf-load-hint">Please wait, this may take a moment...</div>
            </div>
        `;
    }

    private renderError(message: string, hint?: string): void {
        this._container.innerHTML = `
            <div class="pcf-error">
                <div class="pcf-error-icon">⚠️</div>
                <div class="pcf-error-message">${message}</div>
                ${hint ? `<div class="pcf-error-hint">${hint}</div>` : ''}
                <div class="pcf-error-steps">
                    <strong>Configuration Steps:</strong>
                    <ol>
                        <li>Add control to a Subgrid or View</li>
                        <li>Ensure the view has columns configured</li>
                        <li>Bind the control to a data source</li>
                        <li>Publish customizations</li>
                    </ol>
                </div>
            </div>
        `;
    }

    private renderLoading(): void {
        this._tbodyElement.innerHTML = `
            <tr>
                <td colspan="100" class="pcf-loading">
                    <div class="pcf-spinner"></div>
                    <div>Loading data...</div>
                </td>
            </tr>
        `;
    }

    private renderToolbar(): void {
        this._searchContainer.innerHTML = "";
        
        const toolbarContent = document.createElement("div");
        toolbarContent.className = "pcf-toolbar-content";
        
        // Global search
        const searchWrapper = document.createElement("div");
        searchWrapper.className = "pcf-search-wrapper";
        
        const searchIcon = document.createElement("span");
        searchIcon.className = "pcf-search-icon";
        searchIcon.textContent = "🔍";
        
        const searchInput = document.createElement("input");
        searchInput.type = "text";
        searchInput.className = "pcf-global-search";
        searchInput.placeholder = "Search all columns...";
        searchInput.value = this._globalSearch;
        
        searchInput.addEventListener("input", (e) => {
            const value = (e.target as HTMLInputElement).value;
            this._globalSearch = value;
            
            if (this._searchDebounceTimer) {
                clearTimeout(this._searchDebounceTimer);
            }
            
            this._searchDebounceTimer = window.setTimeout(() => {
                this._currentPage = 1;
                this.updateTableOnly();
            }, 300);
        });
        
        searchWrapper.appendChild(searchIcon);
        searchWrapper.appendChild(searchInput);
        toolbarContent.appendChild(searchWrapper);
        
        // Action buttons
        const actionsWrapper = document.createElement("div");
        actionsWrapper.className = "pcf-actions-wrapper";
        actionsWrapper.id = "pcf-actions-wrapper";
        
        this.renderActionButtons(actionsWrapper);
        toolbarContent.appendChild(actionsWrapper);
        
        // Info section
        this._infoSection = document.createElement("div");
        this._infoSection.className = "pcf-info-section";
        this.updateInfoSection();
        
        toolbarContent.appendChild(this._infoSection);
        this._searchContainer.appendChild(toolbarContent);
    }

    private renderActionButtons(container: HTMLElement): void {
        container.innerHTML = "";
        
        // Clear filters
        if (Object.keys(this._filters).length > 0 || this._globalSearch) {
            const clearBtn = document.createElement("button");
            clearBtn.className = "pcf-action-btn";
            clearBtn.textContent = "Clear Filters";
            clearBtn.addEventListener("click", () => {
                this._filters = {};
                this._globalSearch = "";
                this._currentPage = 1;
                
                const searchInput = this._searchContainer.querySelector('.pcf-global-search') as HTMLInputElement;
                if (searchInput) {
                    searchInput.value = "";
                }
                
                this.renderTable();
                this.updateActionButtons();
            });
            container.appendChild(clearBtn);
        }
        
        // Refresh
        const refreshBtn = document.createElement("button");
        refreshBtn.className = "pcf-action-btn";
        refreshBtn.innerHTML = "🔄 Refresh";
        refreshBtn.addEventListener("click", () => {
            console.log("🔄 User clicked Refresh");
            // Reset tracking variables
            this._lastRecordCount = 0;
            this._consecutiveLoadAttempts = 0;
            this._context.parameters.dataSet.refresh();
        });
        container.appendChild(refreshBtn);
    }

    private updateActionButtons(): void {
        const actionsWrapper = this._searchContainer.querySelector('#pcf-actions-wrapper') as HTMLElement;
        if (actionsWrapper) {
            this.renderActionButtons(actionsWrapper);
        }
    }

    private updateInfoSection(): void {
        if (!this._infoSection) return;
        
        this._infoSection.innerHTML = "";
        
        const recordCount = this.getFilteredRecords().length;
        const totalCount = this._records.length;
        
        const recordInfo = recordCount === totalCount ? 
            `<strong>${totalCount}</strong> records` : 
            `<strong>${recordCount}</strong> of <strong>${totalCount}</strong> records`;
        
        const recordCountSpan = document.createElement("span");
        recordCountSpan.className = "pcf-record-count";
        recordCountSpan.innerHTML = recordInfo;
        this._infoSection.appendChild(recordCountSpan);
        
        if (this._selectedRecordIds.length > 0) {
            const selectedInfo = document.createElement("span");
            selectedInfo.className = "pcf-selected-info";
            selectedInfo.textContent = `${this._selectedRecordIds.length} selected`;
            this._infoSection.appendChild(selectedInfo);
        }
    }

    private updateTableOnly(): void {
        this.renderHeader();
        if (this._context.parameters.enableFiltering.raw) {
            this.renderFilterRow();
        }
        this.renderBody();
        if (this._context.parameters.enablePaging.raw) {
            this.renderPagination();
        }
        this.updateInfoSection();
        this.updateActionButtons();
    }

    private renderTable(): void {
        if (this._columns.length === 0) {
            this.renderError("No columns configured");
            return;
        }
        
        this.renderHeader();
        if (this._context.parameters.enableFiltering.raw) {
            this.renderFilterRow();
        }
        this.renderBody();
        if (this._context.parameters.enablePaging.raw) {
            this.renderPagination();
        }
        this.updateInfoSection();
        this.updateActionButtons();
    }

    private renderHeader(): void {
        this._theadElement.innerHTML = "";
        const headerRow = document.createElement("tr");
        headerRow.className = "pcf-header-row";
        
        if (this._context.parameters.enableSelection.raw) {
            const selectAllTh = document.createElement("th");
            selectAllTh.className = "pcf-select-column";
            
            if (this._context.parameters.enableMultiSelect.raw) {
                const selectAllCheckbox = document.createElement("input");
                selectAllCheckbox.type = "checkbox";
                selectAllCheckbox.title = "Select all on this page";
                selectAllCheckbox.addEventListener("change", (e) => {
                    this.handleSelectAll((e.target as HTMLInputElement).checked);
                });
                selectAllTh.appendChild(selectAllCheckbox);
            }
            
            headerRow.appendChild(selectAllTh);
        }
        
        this._columns.forEach(column => {
            const th = document.createElement("th");
            th.className = "pcf-column-header";
            
            const headerContent = document.createElement("div");
            headerContent.className = "pcf-header-content";
            
            const headerText = document.createElement("span");
            headerText.textContent = column.displayName;
            headerContent.appendChild(headerText);
            
            if (this._context.parameters.enableSorting.raw && column.sortable) {
                th.classList.add("pcf-sortable");
                th.addEventListener("click", () => {
                    this.handleSort(column.name);
                });
                
                if (this._sortedColumn === column.name) {
                    const sortIcon = document.createElement("span");
                    sortIcon.className = "pcf-sort-icon";
                    sortIcon.textContent = this._sortDirection === "asc" ? "▲" : "▼";
                    headerContent.appendChild(sortIcon);
                }
            }
            
            th.appendChild(headerContent);
            headerRow.appendChild(th);
        });
        
        this._theadElement.appendChild(headerRow);
    }

    private renderFilterRow(): void {
        if (this._filterRow && this._filterRow.parentNode) {
            this._filterRow.remove();
        }
        
        this._filterRow = document.createElement("tr");
        this._filterRow.className = "pcf-filter-row";
        
        if (this._context.parameters.enableSelection.raw) {
            const emptyTh = document.createElement("th");
            emptyTh.className = "pcf-select-column";
            this._filterRow.appendChild(emptyTh);
        }
        
        this._columns.forEach(column => {
            const th = document.createElement("th");
            const filterInput = document.createElement("input");
            filterInput.type = "text";
            filterInput.className = "pcf-filter-input";
            filterInput.placeholder = `Filter...`;
            filterInput.value = this._filters[column.name] || "";
            
            filterInput.addEventListener("input", (e) => {
                const value = (e.target as HTMLInputElement).value;
                
                if (value && value.trim() !== "") {
                    this._filters[column.name] = value.trim();
                } else {
                    delete this._filters[column.name];
                }
                
                if (this._searchDebounceTimer) {
                    clearTimeout(this._searchDebounceTimer);
                }
                
                this._searchDebounceTimer = window.setTimeout(() => {
                    this._currentPage = 1;
                    this.updateTableOnly();
                }, 300);
            });
            
            th.appendChild(filterInput);
            this._filterRow.appendChild(th);
        });
        
        this._theadElement.appendChild(this._filterRow);
    }

    private renderBody(): void {
        this._tbodyElement.innerHTML = "";
        
        let filteredRecords = this.getFilteredRecords();
        filteredRecords = this.getSortedRecords(filteredRecords);
        
        const pageSize = this._context.parameters.pageSize.raw || 10;
        const paging = this._context.parameters.enablePaging.raw;
        
        const startIndex = paging ? (this._currentPage - 1) * pageSize : 0;
        const endIndex = paging ? startIndex + pageSize : filteredRecords.length;
        const pagedRecords = filteredRecords.slice(startIndex, endIndex);
        
        if (pagedRecords.length === 0) {
            const noDataRow = document.createElement("tr");
            const noDataCell = document.createElement("td");
            noDataCell.colSpan = this._columns.length + (this._context.parameters.enableSelection.raw ? 1 : 0);
            noDataCell.className = "pcf-no-data";
            noDataCell.innerHTML = `
                <div class="pcf-no-data-content">
                    <div class="pcf-no-data-icon">📋</div>
                    <div class="pcf-no-data-text">No records found</div>
                    ${this._globalSearch || Object.keys(this._filters).length > 0 ? 
                        '<div class="pcf-no-data-hint">Try adjusting your filters</div>' : ''}
                </div>
            `;
            noDataRow.appendChild(noDataCell);
            this._tbodyElement.appendChild(noDataRow);
            return;
        }
        
        pagedRecords.forEach((record) => {
            const row = document.createElement("tr");
            row.className = "pcf-data-row";
            row.setAttribute("data-record-id", record.getRecordId());
            
            if (this._context.parameters.enableSelection.raw) {
                const selectTd = document.createElement("td");
                selectTd.className = "pcf-select-column";
                const checkbox = document.createElement("input");
                checkbox.type = this._context.parameters.enableMultiSelect.raw ? "checkbox" : "radio";
                checkbox.name = "record-select";
                checkbox.checked = this._selectedRecordIds.includes(record.getRecordId());
                checkbox.addEventListener("change", (e) => {
                    this.handleRowSelect(record.getRecordId(), (e.target as HTMLInputElement).checked);
                });
                selectTd.appendChild(checkbox);
                row.appendChild(selectTd);
            }
            
            this._columns.forEach(column => {
                const td = document.createElement("td");
                td.className = "pcf-data-cell";
                const value = record.getFormattedValue(column.name);
                td.textContent = value || "";
                td.title = value || "";
                td.setAttribute("data-type", column.dataType);
                row.appendChild(td);
            });
            
            row.addEventListener("click", (e) => {
                const target = e.target as HTMLElement;
                if (target.tagName !== "INPUT") {
                    this.handleRowClick(record);
                }
            });
            
            this._tbodyElement.appendChild(row);
        });
    }

    private renderPagination(): void {
        this._paginationContainer.innerHTML = "";
        
        const filteredRecords = this.getFilteredRecords();
        const pageSize = this._context.parameters.pageSize.raw || 10;
        const totalPages = Math.ceil(filteredRecords.length / pageSize);
        
        if (totalPages <= 1) return;
        
        const paginationWrapper = document.createElement("div");
        paginationWrapper.className = "pcf-pagination-wrapper";
        
        const pageInfo = document.createElement("div");
        pageInfo.className = "pcf-page-info";
        const startRecord = (this._currentPage - 1) * pageSize + 1;
        const endRecord = Math.min(this._currentPage * pageSize, filteredRecords.length);
        pageInfo.innerHTML = `
            <span>Showing <strong>${startRecord}-${endRecord}</strong> of <strong>${filteredRecords.length}</strong></span>
        `;
        paginationWrapper.appendChild(pageInfo);
        
        const paginationButtons = document.createElement("div");
        paginationButtons.className = "pcf-pagination-buttons";
        
        const firstBtn = this.createPaginationButton("⟪", 1, this._currentPage === 1, false, "First page");
        paginationButtons.appendChild(firstBtn);
        
        const prevBtn = this.createPaginationButton("‹", this._currentPage - 1, this._currentPage === 1, false, "Previous page");
        paginationButtons.appendChild(prevBtn);
        
        const maxVisiblePages = 5;
        const startPage = Math.max(1, this._currentPage - Math.floor(maxVisiblePages / 2));
        const endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
        
        if (startPage > 1) {
            const ellipsis = document.createElement("span");
            ellipsis.className = "pcf-pagination-ellipsis";
            ellipsis.textContent = "...";
            paginationButtons.appendChild(ellipsis);
        }
        
        for (let i = startPage; i <= endPage; i++) {
            const pageBtn = this.createPaginationButton(i.toString(), i, false, i === this._currentPage, `Page ${i}`);
            paginationButtons.appendChild(pageBtn);
        }
        
        if (endPage < totalPages) {
            const ellipsis = document.createElement("span");
            ellipsis.className = "pcf-pagination-ellipsis";
            ellipsis.textContent = "...";
            paginationButtons.appendChild(ellipsis);
        }
        
        const nextBtn = this.createPaginationButton("›", this._currentPage + 1, this._currentPage === totalPages, false, "Next page");
        paginationButtons.appendChild(nextBtn);
        
        const lastBtn = this.createPaginationButton("⟫", totalPages, this._currentPage === totalPages, false, "Last page");
        paginationButtons.appendChild(lastBtn);
        
        paginationWrapper.appendChild(paginationButtons);
        this._paginationContainer.appendChild(paginationWrapper);
    }

    private createPaginationButton(text: string, page: number, disabled: boolean, active = false, title = ""): HTMLButtonElement {
        const button = document.createElement("button");
        button.textContent = text;
        button.className = "pcf-pagination-btn";
        button.title = title;
        
        if (active) button.classList.add("active");
        button.disabled = disabled;
        
        if (!disabled) {
            button.addEventListener("click", () => {
                this._currentPage = page;
                this.updateTableOnly();
            });
        }
        
        return button;
    }

    private handleSort(columnName: string): void {
        if (this._sortedColumn === columnName) {
            this._sortDirection = this._sortDirection === "asc" ? "desc" : "asc";
        } else {
            this._sortedColumn = columnName;
            this._sortDirection = "asc";
        }
        
        this.renderTable();
    }

    private handleRowSelect(recordId: string, checked: boolean): void {
        if (this._context.parameters.enableMultiSelect.raw) {
            if (checked) {
                if (!this._selectedRecordIds.includes(recordId)) {
                    this._selectedRecordIds.push(recordId);
                }
            } else {
                this._selectedRecordIds = this._selectedRecordIds.filter(id => id !== recordId);
            }
        } else {
            this._selectedRecordIds = checked ? [recordId] : [];
        }
        
        this._context.parameters.dataSet.setSelectedRecordIds(this._selectedRecordIds);
        this.updateInfoSection();
    }

    private handleSelectAll(checked: boolean): void {
        const filteredRecords = this.getFilteredRecords();
        const pageSize = this._context.parameters.pageSize.raw || 10;
        const paging = this._context.parameters.enablePaging.raw;
        
        const startIndex = paging ? (this._currentPage - 1) * pageSize : 0;
        const endIndex = paging ? startIndex + pageSize : filteredRecords.length;
        const pagedRecords = filteredRecords.slice(startIndex, endIndex);
        
        if (checked) {
            pagedRecords.forEach(record => {
                const id = record.getRecordId();
                if (!this._selectedRecordIds.includes(id)) {
                    this._selectedRecordIds.push(id);
                }
            });
        } else {
            const pagedIds = pagedRecords.map(r => r.getRecordId());
            this._selectedRecordIds = this._selectedRecordIds.filter(id => !pagedIds.includes(id));
        }
        
        this._context.parameters.dataSet.setSelectedRecordIds(this._selectedRecordIds);
        this.renderBody();
        this.updateInfoSection();
    }

    private handleRowClick(record: ComponentFramework.PropertyHelper.DataSetApi.EntityRecord): void {
        if (!this._isTestHarness) {
            try {
                this._context.parameters.dataSet.openDatasetItem(record.getNamedReference());
            } catch (error) {
                console.log("Cannot open record in test harness");
            }
        }
    }

    private getFilteredRecords(): ComponentFramework.PropertyHelper.DataSetApi.EntityRecord[] {
        let filtered = this._records;
        
        if (this._globalSearch && this._globalSearch.trim() !== "") {
            const searchTerm = this._globalSearch.toLowerCase();
            filtered = filtered.filter(record => {
                return this._columns.some(column => {
                    const value = (record.getFormattedValue(column.name) || "").toLowerCase();
                    return value.includes(searchTerm);
                });
            });
        }
        
        if (Object.keys(this._filters).length > 0) {
            filtered = filtered.filter(record => {
                return Object.keys(this._filters).every(columnName => {
                    const filterValue = this._filters[columnName].toLowerCase();
                    const cellValue = (record.getFormattedValue(columnName) || "").toLowerCase();
                    return cellValue.includes(filterValue);
                });
            });
        }
        
        return filtered;
    }

    private getSortedRecords(records: ComponentFramework.PropertyHelper.DataSetApi.EntityRecord[]): ComponentFramework.PropertyHelper.DataSetApi.EntityRecord[] {
        if (!this._sortedColumn) {
            return records;
        }
        
        return [...records].sort((a, b) => {
            const aValue = a.getFormattedValue(this._sortedColumn) || "";
            const bValue = b.getFormattedValue(this._sortedColumn) || "";
            
            const aNum = parseFloat(aValue);
            const bNum = parseFloat(bValue);
            
            let comparison = 0;
            if (!isNaN(aNum) && !isNaN(bNum)) {
                comparison = aNum - bNum;
            } else {
                comparison = aValue.localeCompare(bValue, undefined, { 
                    numeric: true, 
                    sensitivity: 'base' 
                });
            }
            
            return this._sortDirection === "asc" ? comparison : -comparison;
        });
    }

    public getOutputs(): IOutputs {
        return {};
    }

    public destroy(): void {
        if (this._searchDebounceTimer) {
            clearTimeout(this._searchDebounceTimer);
        }
        this._container.innerHTML = "";
    }
}