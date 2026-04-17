import SwiftUI

struct CatalogFeedView: View {
    let viewModel: CatalogViewModel
    let downloadManager: DownloadManager
    @Environment(\.modelContext) private var modelContext

    var body: some View {
        Group {
            if viewModel.isLoading && viewModel.feed == nil {
                loadingView
            } else if let error = viewModel.error, viewModel.feed == nil {
                errorView(error)
            } else if let feed = viewModel.feed {
                feedContent(feed)
            } else {
                emptyView
            }
        }
        .bookshelfBackground()
    }

    // MARK: - States

    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView()
                .controlSize(.large)
                .tint(BookshelfTheme.accent)
            Text("Loading catalog…")
                .font(.system(size: 14))
                .foregroundStyle(BookshelfTheme.mutedText)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .bookshelfBackground()
    }

    private func errorView(_ error: String) -> some View {
        VStack(spacing: 20) {
            Image(systemName: "wifi.exclamationmark")
                .font(.system(size: 48, weight: .light))
                .foregroundStyle(BookshelfTheme.accent)

            VStack(spacing: 8) {
                Text("Connection Error")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(.white)
                Text(error)
                    .font(.system(size: 13))
                    .foregroundStyle(BookshelfTheme.mutedText)
                    .multilineTextAlignment(.center)
            }

            Button {
                Task { await viewModel.loadRootCatalog() }
            } label: {
                Text("Retry")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 10)
                    .background(BookshelfTheme.accent)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            }
            .buttonStyle(.plain)
        }
        .padding(40)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .bookshelfBackground()
    }

    private var emptyView: some View {
        VStack(spacing: 16) {
            Image(systemName: "books.vertical")
                .font(.system(size: 48, weight: .light))
                .foregroundStyle(BookshelfTheme.dimText)
            Text("No Content")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(BookshelfTheme.mutedText)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .bookshelfBackground()
    }

    // MARK: - Feed

    @ViewBuilder
    private func feedContent(_ feed: OPDSFeed) -> some View {
        if feed.isNavigation {
            navigationFeed(feed)
        } else {
            acquisitionFeed(feed)
        }
    }

    // MARK: - Navigation Feed (categories)

    private func navigationFeed(_ feed: OPDSFeed) -> some View {
        ScrollView {
            LazyVStack(spacing: 8) {
                ForEach(feed.entries) { entry in
                    NavigationLink(value: entry) {
                        NavigationCard(entry: entry)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
        .navigationDestination(for: OPDSEntry.self) { entry in
            if let navURL = entry.navigationLink {
                SubCatalogView(
                    title: entry.title,
                    url: navURL,
                    server: viewModel.server,
                    downloadManager: downloadManager
                )
            }
        }
        .scrollContentBackground(.hidden)
        .bookshelfBackground()
    }

    // MARK: - Acquisition Feed (books grid)

    private func acquisitionFeed(_ feed: OPDSFeed) -> some View {
        ScrollView {
            LazyVGrid(columns: gridColumns, spacing: gridSpacing) {
                ForEach(feed.entries) { entry in
                    if entry.isBook {
                        NavigationLink {
                            BookDetailView(
                                entry: entry,
                                server: viewModel.server,
                                downloadManager: downloadManager
                            )
                        } label: {
                            BookCard(entry: entry, server: viewModel.server)
                        }
                        .buttonStyle(.plain)
                    } else if entry.navigationLink != nil {
                        NavigationLink {
                            if let navURL = entry.navigationLink {
                                SubCatalogView(
                                    title: entry.title,
                                    url: navURL,
                                    server: viewModel.server,
                                    downloadManager: downloadManager
                                )
                            }
                        } label: {
                            NavigationCard(entry: entry)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 16)

            if feed.nextPageURL != nil {
                Button {
                    Task { await viewModel.loadNextPage() }
                } label: {
                    Text("Load More")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(BookshelfTheme.accent)
                        .padding(.horizontal, 24)
                        .padding(.vertical, 10)
                        .background(BookshelfTheme.accent.opacity(0.12))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                        .overlay(
                            RoundedRectangle(cornerRadius: 8)
                                .stroke(BookshelfTheme.accent.opacity(0.3), lineWidth: 1)
                        )
                }
                .buttonStyle(.plain)
                .padding(.bottom, 40)
            }
        }
        .scrollContentBackground(.hidden)
        .bookshelfBackground()
    }

    // MARK: - Grid Layout

    private var gridColumns: [GridItem] {
        #if os(macOS)
        [GridItem(.adaptive(minimum: 140, maximum: 170), spacing: 14)]
        #elseif os(iOS)
        if UIDevice.current.userInterfaceIdiom == .pad {
            return [GridItem(.adaptive(minimum: 130, maximum: 160), spacing: 14)]
        } else {
            return [GridItem(.adaptive(minimum: 100, maximum: 130), spacing: 10)]
        }
        #endif
    }

    private var gridSpacing: CGFloat {
        #if os(macOS)
        20
        #else
        UIDevice.current.userInterfaceIdiom == .pad ? 20 : 16
        #endif
    }


}

// MARK: - OPDSEntry Hashable conformance for NavigationLink

extension OPDSEntry: Hashable {
    static func == (lhs: OPDSEntry, rhs: OPDSEntry) -> Bool {
        lhs.id == rhs.id
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }
}
