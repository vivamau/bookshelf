import Foundation
import SwiftUI

/// ViewModel for browsing an OPDS catalog.
@Observable
class CatalogViewModel {
    var feed: OPDSFeed?
    var isLoading = false
    var error: String?
    var searchQuery = ""
    var searchDescription: OpenSearchDescription?
    var navigationPath: [CatalogPage] = []

    let server: ServerConfig
    private let client: NetworkClient

    struct CatalogPage: Hashable {
        let title: String
        let url: String

        func hash(into hasher: inout Hasher) {
            hasher.combine(url)
        }

        static func == (lhs: CatalogPage, rhs: CatalogPage) -> Bool {
            lhs.url == rhs.url
        }
    }

    init(server: ServerConfig) {
        self.server = server
        self.client = NetworkClient(server: server)
    }

    /// Load the root OPDS catalog.
    @MainActor
    func loadRootCatalog() async {
        await loadFeed(url: server.opdsRootURL, title: server.name)
    }

    /// Load a specific feed URL.
    @MainActor
    func loadFeed(url: String, title: String? = nil) async {
        isLoading = true
        error = nil

        do {
            let newFeed = try await client.fetchOPDSFeed(url: url)
            self.feed = newFeed

            // Try to load search description
            if let searchURL = newFeed.searchURL, searchDescription == nil {
                Task {
                    do {
                        searchDescription = try await client.fetchOpenSearch(url: searchURL)
                    } catch {
                        // Non-critical
                        print("Search description load failed: \(error)")
                    }
                }
            }
        } catch {
            self.error = error.localizedDescription
        }

        isLoading = false
    }

    /// Navigate to a sub-catalog.
    @MainActor
    func navigateTo(url: String, title: String) async {
        navigationPath.append(CatalogPage(title: title, url: url))
        await loadFeed(url: url, title: title)
    }

    /// Perform a search.
    @MainActor
    func performSearch() async {
        guard !searchQuery.trimmingCharacters(in: .whitespaces).isEmpty else { return }

        if let searchDesc = searchDescription,
           let url = searchDesc.searchURL(for: searchQuery) {
            await loadFeed(url: url, title: "Search: \(searchQuery)")
        }
    }

    /// Load next page if available.
    @MainActor
    func loadNextPage() async {
        guard let nextURL = feed?.nextPageURL else { return }
        // For pagination, we append entries rather than replacing
        do {
            let nextFeed = try await client.fetchOPDSFeed(url: nextURL)
            var current = feed
            let combined = OPDSFeed(
                id: current?.id ?? nextFeed.id,
                title: current?.title ?? nextFeed.title,
                updated: current?.updated,
                entries: (current?.entries ?? []) + nextFeed.entries,
                links: nextFeed.links,  // Update links for next pagination
                totalResults: nextFeed.totalResults ?? current?.totalResults,
                itemsPerPage: nextFeed.itemsPerPage,
                startIndex: nextFeed.startIndex
            )
            self.feed = combined
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// Get the NetworkClient for downloads.
    var networkClient: NetworkClient { client }
}
