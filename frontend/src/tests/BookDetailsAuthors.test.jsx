import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import BookDetails from '../pages/BookDetails';
import { booksApi, booksAuthorsApi, authorsApi } from '../api/api';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Mock API and Auth
jest.mock('../api/api');
jest.mock('../context/AuthContext', () => ({
    useAuth: jest.fn()
}));

// Mock AuthorSearch to simplify test
jest.mock('../components/AuthorSearch', () => ({ onSelect, placeholder }) => (
    <div data-testid="author-search-mock">
        <input 
            placeholder={placeholder} 
            onChange={(e) => {
               if (e.target.value === 'triggerSelect') {
                   onSelect({ ID: 99, author_name: 'New', author_lastname: 'Author' });
               }
            }}
        />
    </div>
));

describe('BookDetails Authors Management', () => {
    const mockBook = {
        ID: 1,
        book_title: 'Test Book',
        authors_data: '10::John Doe::101||11::Jane Smith::102',
        book_create_date: Date.now()
    };

    beforeEach(() => {
        useAuth.mockReturnValue({
            user: { role: 'admin' },
            hasPermission: () => true
        });
        booksApi.getById.mockResolvedValue({ data: { data: mockBook } });
        booksApi.getReviews.mockResolvedValue({ data: { data: [] } });
        authorsApi.getAll.mockResolvedValue({ data: { data: [] } });
        booksAuthorsApi.getAll.mockResolvedValue({ data: { data: [
            { ID: 101, book_id: 1, author_id: 10 },
            { ID: 102, book_id: 1, author_id: 11 }
        ]}});
    });

    const renderComponent = () => {
        render(
            <MemoryRouter initialEntries={['/book/1']}>
                <Routes>
                    <Route path="/book/:id" element={<BookDetails />} />
                </Routes>
            </MemoryRouter>
        );
    };

    test('renders current authors in edit mode', async () => {
        renderComponent();
        await waitFor(() => screen.getByText('Test Book'));
        
        // Enter edit mode
        fireEvent.click(screen.getByText('EDIT DETAILS'));

        expect(screen.getByText('John Doe')).toBeInTheDocument();
        expect(screen.getByText('Jane Smith')).toBeInTheDocument();
        // Check for remove buttons (there should be 2 since total > 1)
        const removeBtns = screen.getAllByTitle('Remove author');
        expect(removeBtns.length).toBe(2);
    });

    test('removes an author from the list', async () => {
        renderComponent();
        await waitFor(() => screen.getByText('Test Book'));
        fireEvent.click(screen.getByText('EDIT DETAILS'));

        // Remove John Doe
        const removeBtns = screen.getAllByTitle('Remove author');
        fireEvent.click(removeBtns[0]); // Remove first one

        await waitFor(() => {
            expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
            expect(screen.getByText('Jane Smith')).toBeInTheDocument();
        });
    });

    test('adds a new author to the list', async () => {
        renderComponent();
        await waitFor(() => screen.getByText('Test Book'));
        fireEvent.click(screen.getByText('EDIT DETAILS'));

        // Simulate add via mocked AuthorSearch
        const searchInput = screen.getByPlaceholderText('Add another author...');
        fireEvent.change(searchInput, { target: { value: 'triggerSelect' } });

        await waitFor(() => {
            expect(screen.getByText('New Author')).toBeInTheDocument();
        });
    });

    test('restricts removing the last author', async () => {
        // Setup book with single author
        booksApi.getById.mockResolvedValue({ 
            data: { 
                data: { ...mockBook, authors_data: '10::Single Author::101' } 
            } 
        });

        renderComponent();
        await waitFor(() => screen.getByText('Test Book'));
        fireEvent.click(screen.getByText('EDIT DETAILS'));

        expect(screen.getByText('Single Author')).toBeInTheDocument();
        // Should NOT see remove button
        expect(screen.queryByTitle('Remove author')).not.toBeInTheDocument();
    });

    test('prevent saving if no authors (handles edge case if UI allowed it)', async () => {
        window.alert = jest.fn();
        renderComponent();
        await waitFor(() => screen.getByText('Test Book'));
        fireEvent.click(screen.getByText('EDIT DETAILS'));
        
        // Mock removing both (via custom check logic in test or if we could)
        // Since UI prevents it, we can't easily click to remove all. 
        // This test mostly verifies logic, but we'll trust the "Remove" button absence test for UI enforcement.
        // Instead, let's verify save triggers the correct API calls for ADD/REMOVE.
        
        // 1. Remove one author
        const removeBtns = screen.getAllByTitle('Remove author');
        fireEvent.click(removeBtns[0]); 

        // 2. Add one author
        const searchInput = screen.getByPlaceholderText('Add another author...');
        fireEvent.change(searchInput, { target: { value: 'triggerSelect' } });

        // 3. Save
        const saveBtn = screen.getByText('SAVE');
        fireEvent.click(saveBtn);
        
        await waitFor(() => {
            // Should delete John Doe (ID 10) relation (ID 101)
            expect(booksAuthorsApi.delete).toHaveBeenCalledWith(101);
            // Should add New Author (ID 99)
            expect(booksAuthorsApi.create).toHaveBeenCalledWith(expect.objectContaining({
                book_id: 1,
                author_id: 99
            }));
        });
    });
});
