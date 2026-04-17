import SwiftUI
import SwiftData

struct ContentView: View {
    @Query private var servers: [ServerConfig]
    @State private var selectedTab: AppTab = .servers
    @State private var selectedServer: ServerConfig?

    enum AppTab: Hashable {
        case servers
        case library
        case settings
    }

    var body: some View {
        #if os(macOS)
        NavigationSplitView {
            sidebar
        } detail: {
            detailView
        }
        .frame(minWidth: 900, minHeight: 600)
        .preferredColorScheme(.dark)
        #else
        TabView(selection: $selectedTab) {
            Tab("Servers", systemImage: "server.rack", value: AppTab.servers) {
                NavigationStack {
                    ServerListView(selectedServer: $selectedServer)
                }
            }
            Tab("Library", systemImage: "books.vertical", value: AppTab.library) {
                NavigationStack {
                    LocalLibraryView()
                }
            }
            Tab("Settings", systemImage: "gear", value: AppTab.settings) {
                NavigationStack {
                    SettingsView()
                }
            }
        }
        .tint(BookshelfTheme.accent)
        .preferredColorScheme(.dark)
        .sheet(item: $selectedServer) { server in
            NavigationStack {
                CatalogRootView(server: server)
            }
            .preferredColorScheme(.dark)
        }
        #endif
    }

    // MARK: - macOS Sidebar

    #if os(macOS)
    private var sidebar: some View {
        VStack(spacing: 0) {
            // App title
            HStack(spacing: 10) {
                Image(systemName: "books.vertical.fill")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(BookshelfTheme.accent)
                Text("Bookshelf")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(.white)
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)

            Divider().background(BookshelfTheme.border)

            // Navigation items
            VStack(spacing: 2) {
                sidebarItem(tab: .servers, icon: "server.rack", label: "Servers")
                sidebarItem(tab: .library, icon: "books.vertical.fill", label: "My Library")
            }
            .padding(.horizontal, 8)
            .padding(.top, 8)

            Spacer()

            Divider().background(BookshelfTheme.border)

            // Settings at bottom
            sidebarItem(tab: .settings, icon: "gear", label: "Settings")
                .padding(.horizontal, 8)
                .padding(.vertical, 8)
        }
        .background(BookshelfTheme.surface)
        .frame(minWidth: 200)
    }

    private func sidebarItem(tab: AppTab, icon: String, label: String) -> some View {
        Button {
            selectedTab = tab
        } label: {
            HStack(spacing: 10) {
                Image(systemName: icon)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(selectedTab == tab ? BookshelfTheme.accent : BookshelfTheme.mutedText)
                    .frame(width: 20)

                Text(label)
                    .font(.system(size: 13, weight: selectedTab == tab ? .semibold : .regular))
                    .foregroundStyle(selectedTab == tab ? .white : BookshelfTheme.mutedText)

                Spacer()
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .background(
                selectedTab == tab
                    ? BookshelfTheme.accent.opacity(0.12)
                    : Color.clear
            )
            .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 7)
                    .stroke(selectedTab == tab ? BookshelfTheme.accent.opacity(0.2) : Color.clear, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private var detailView: some View {
        switch selectedTab {
        case .servers:
            if let server = selectedServer {
                CatalogRootView(server: server)
            } else {
                ServerListView(selectedServer: $selectedServer)
            }
        case .library:
            LocalLibraryView()
        case .settings:
            SettingsView()
        }
    }
    #endif
}
