import Foundation
import SwiftUI

/// ViewModel for the native Bookshelf REST API experience.
@Observable
class BookshelfViewModel {
    // MARK: - Library
    var books: [BookshelfBook] = []
    var totalBooks: Int = 0
    var currentPage: Int = 1
    var isLoadingBooks = false

    // MARK: - Sections
    var continueReading: [BookshelfBook] = []
    var genres: [BookshelfGenre] = []
    var authors: [BookshelfAuthor] = []
    var isLoadingSections = false

    // MARK: - Browse
    var browseBooks: [BookshelfBook] = []
    var isLoadingBrowse = false
    var browseTitle: String = ""

    // MARK: - Search
    var searchQuery: String = ""
    var searchResults: [BookshelfBook] = []
    var isSearching = false

    // MARK: - Filters
    var sortBy: String = "latest"
    var formatFilter: String = "all"

    // MARK: - State
    var error: String?

    let server: ServerConfig
    let client: NetworkClient

    static let pageLimit = 50

    init(server: ServerConfig) {
        self.server = server
        self.client = NetworkClient(server: server)
    }

    // MARK: - Load Home Data

    @MainActor
    func loadHome() async {
        isLoadingSections = true
        error = nil
        async let booksTask: () = loadBooks(reset: true)
        async let continueTask: () = loadContinueReading()
        async let genresTask: () = loadGenres()
        await booksTask
        await continueTask
        await genresTask
        isLoadingSections = false
    }

    // MARK: - Books

    @MainActor
    func loadBooks(reset: Bool = false) async {
        if reset { currentPage = 1 }
        isLoadingBooks = true
        error = nil
        do {
            let resp = try await client.fetchBooks(
                page: currentPage,
                limit: Self.pageLimit,
                sort: sortBy,
                search: "",
                format: formatFilter
            )
            if reset {
                books = resp.data
            } else {
                books += resp.data
            }
            totalBooks = resp.total ?? books.count
        } catch {
            self.error = error.localizedDescription
        }
        isLoadingBooks = false
    }

    @MainActor
    func loadNextPage() async {
        guard books.count < totalBooks else { return }
        currentPage += 1
        await loadBooks(reset: false)
    }

    // MARK: - Continue Reading

    @MainActor
    func loadContinueReading() async {
        do {
            continueReading = try await client.fetchContinueReading()
        } catch {
            // Non-critical — don't surface
        }
    }

    // MARK: - Genres

    @MainActor
    func loadGenres() async {
        do {
            genres = try await client.fetchGenres()
        } catch {
            // Non-critical
        }
    }

    // MARK: - Authors

    @MainActor
    func loadAuthors() async {
        guard authors.isEmpty else { return }
        do {
            authors = try await client.fetchAuthors()
        } catch {
            self.error = error.localizedDescription
        }
    }

    // MARK: - Browse by Genre

    @MainActor
    func loadBooksByGenre(genre: BookshelfGenre) async {
        isLoadingBrowse = true
        browseTitle = genre.name
        browseBooks = []
        do {
            browseBooks = try await client.fetchBooksByGenre(genreId: genre.genreID)
        } catch {
            self.error = error.localizedDescription
        }
        isLoadingBrowse = false
    }

    // MARK: - Browse by Author

    @MainActor
    func loadBooksByAuthor(author: BookshelfAuthor) async {
        isLoadingBrowse = true
        browseTitle = author.fullName
        browseBooks = []
        do {
            browseBooks = try await client.fetchBooksByAuthor(authorId: author.authorID)
        } catch {
            self.error = error.localizedDescription
        }
        isLoadingBrowse = false
    }

    // MARK: - Search

    @MainActor
    func search() async {
        let query = searchQuery.trimmingCharacters(in: .whitespaces)
        guard !query.isEmpty else { searchResults = []; return }
        isSearching = true
        do {
            let resp = try await client.fetchBooks(
                page: 1,
                limit: 100,
                sort: sortBy,
                search: query,
                format: formatFilter
            )
            searchResults = resp.data
        } catch {
            self.error = error.localizedDescription
        }
        isSearching = false
    }

    // MARK: - Filters

    @MainActor
    func applySort(_ sort: String) async {
        sortBy = sort
        await loadBooks(reset: true)
    }

    @MainActor
    func applyFormat(_ format: String) async {
        formatFilter = format
        await loadBooks(reset: true)
    }
}
