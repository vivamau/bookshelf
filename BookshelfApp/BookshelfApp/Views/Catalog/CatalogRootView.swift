import SwiftUI

struct CatalogRootView: View {
    let server: ServerConfig
    @State private var viewModel: CatalogViewModel
    @State private var downloadManager = DownloadManager()
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss

    init(server: ServerConfig) {
        self.server = server
        self._viewModel = State(initialValue: CatalogViewModel(server: server))
    }

    var body: some View {
        NavigationStack {
            CatalogFeedView(viewModel: viewModel, downloadManager: downloadManager)
                .navigationTitle(server.name)
                #if !os(macOS)
                .navigationBarTitleDisplayMode(.large)
                #endif
                .bookshelfNavBar()
                .toolbar {
                    #if !os(macOS)
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Close") { dismiss() }
                            .foregroundStyle(BookshelfTheme.accent)
                    }
                    #endif

                    if downloadManager.hasActiveDownloads {
                        ToolbarItem(placement: .primaryAction) {
                            DownloadIndicator(downloadManager: downloadManager)
                        }
                    }
                }
                .searchable(
                    text: $viewModel.searchQuery,
                    prompt: "Search catalog"
                )
                .onSubmit(of: .search) {
                    Task { await viewModel.performSearch() }
                }
                .task { await viewModel.loadRootCatalog() }
                .refreshable { await viewModel.loadRootCatalog() }
                .environment(downloadManager)
        }
        .preferredColorScheme(.dark)
    }
}

struct DownloadIndicator: View {
    let downloadManager: DownloadManager

    var body: some View {
        let activeCount = downloadManager.activeDownloads.values.filter { $0.status == .downloading }.count
        if activeCount > 0 {
            HStack(spacing: 5) {
                ProgressView()
                    .controlSize(.small)
                    .tint(BookshelfTheme.accent)
                Text("\(activeCount)")
                    .font(.system(size: 12, weight: .semibold))
                    .monospacedDigit()
                    .foregroundStyle(.white)
            }
        }
    }
}
