import SwiftUI

/// A child catalog page loaded from a navigation link.
struct SubCatalogView: View {
    let title: String
    let url: String
    let server: ServerConfig
    let downloadManager: DownloadManager

    @State private var viewModel: CatalogViewModel

    init(title: String, url: String, server: ServerConfig, downloadManager: DownloadManager) {
        self.title = title
        self.url = url
        self.server = server
        self.downloadManager = downloadManager
        self._viewModel = State(initialValue: CatalogViewModel(server: server))
    }

    var body: some View {
        CatalogFeedView(viewModel: viewModel, downloadManager: downloadManager)
            .navigationTitle(title)
            #if !os(macOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .bookshelfNavBar()
            .task { await viewModel.loadFeed(url: url, title: title) }
            .refreshable { await viewModel.loadFeed(url: url, title: title) }
    }
}
