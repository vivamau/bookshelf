import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import AuthorSearch from '../components/AuthorSearch';
import { authorsApi } from '../api/api';

// Mock the API
jest.mock('../api/api', () => ({
    authorsApi: {
        getAll: jest.fn(),
        create: jest.fn()
    }
}));

// Mock Lucide icons
jest.mock('lucide-react', () => ({
    Search: () => <div data-testid="search-icon">Search</div>,
    Plus: () => <div data-testid="plus-icon">Plus</div>,
    X: () => <div data-testid="x-icon">X</div>,
    User: () => <div data-testid="user-icon">User</div>,
}));

// Mock Utility
jest.mock('../lib/utils', () => ({
    cn: (...args) => args.join(' ')
}));

describe('AuthorSearch Component', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('renders search input initially', () => {
        render(<AuthorSearch onSelect={() => {}} />);
        expect(screen.getByPlaceholderText('Search or add author...')).toBeInTheDocument();
        expect(screen.getByTestId('search-icon')).toBeInTheDocument();
    });

    test('renders selected author view when author is provided', () => {
        const author = { ID: 1, author_name: 'John', author_lastname: 'Doe' };
        render(<AuthorSearch onSelect={() => {}} selectedAuthor={author} />);
        
        expect(screen.getByText('John Doe')).toBeInTheDocument();
        expect(screen.getByTestId('user-icon')).toBeInTheDocument();
        expect(screen.queryByPlaceholderText('Search or add author...')).not.toBeInTheDocument();
    });

    test('searches for authors on input change', async () => {
        authorsApi.getAll.mockResolvedValue({ 
            data: { 
                data: [{ ID: 1, author_name: 'Jane', author_lastname: 'Austen' }] 
            } 
        });

        render(<AuthorSearch onSelect={() => {}} />);
        const input = screen.getByPlaceholderText('Search or add author...');
        
        fireEvent.change(input, { target: { value: 'Jane' } });

        // Wait for debounce and API call
        await waitFor(() => {
            expect(authorsApi.getAll).toHaveBeenCalledWith({ search: 'Jane', limit: 10 });
        });

        expect(screen.getByText('Jane Austen')).toBeInTheDocument();
    });

    test('shows create option when search yields no results', async () => {
        authorsApi.getAll.mockResolvedValue({ data: { data: [] } });

        render(<AuthorSearch onSelect={() => {}} />);
        const input = screen.getByPlaceholderText('Search or add author...');
        
        fireEvent.change(input, { target: { value: 'Unknown Author' } });

        await waitFor(() => {
            expect(screen.getByText('Create "Unknown Author"')).toBeInTheDocument();
        });
    });

    test('switches to create mode and simulates author creation', async () => {
         // Setup mock for creation
         const newAuthor = { ID: 100, author_name: 'John', author_lastname: 'Smith' };
         authorsApi.getAll.mockResolvedValue({ data: { data: [] } });
         authorsApi.create.mockResolvedValue({ data: { data: newAuthor } });
         
         const handleSelect = jest.fn();

         render(<AuthorSearch onSelect={handleSelect} />);
         const input = screen.getByPlaceholderText('Search or add author...');

         // 1. Enter name and click create option
         fireEvent.change(input, { target: { value: 'John Smith' } });
         await waitFor(() => screen.getByText('Create "John Smith"'));
         fireEvent.click(screen.getByText('Create "John Smith"'));

         // 2. Check form appears
         expect(screen.getByPlaceholderText('First Name')).toHaveValue('John');
         expect(screen.getByPlaceholderText('Last Name')).toHaveValue('Smith');
         expect(screen.getByText('Create New Author')).toBeInTheDocument();

         // 3. Click Create button
         const createBtn = screen.getByRole('button', { name: 'Create' });
         fireEvent.click(createBtn);

         // 4. Verify API call and callback
         await waitFor(() => {
             expect(authorsApi.create).toHaveBeenCalledWith({
                 author_name: 'John',
                 author_lastname: 'Smith',
                 author_create_date: expect.any(Number)
             });
             expect(handleSelect).toHaveBeenCalledWith(newAuthor);
         });
    });
    
    test('clears selection when X is clicked', () => {
        const handleSelect = jest.fn();
        const author = { ID: 1, author_name: 'John', author_lastname: 'Doe' };
        
        render(<AuthorSearch onSelect={handleSelect} selectedAuthor={author} />);
        
        const closeBtn = screen.getByRole('button');
        fireEvent.click(closeBtn);
        
        expect(handleSelect).toHaveBeenCalledWith(null);
    });

    test('uses custom placeholder if provided', () => {
        render(<AuthorSearch onSelect={() => {}} placeholder="Custom Placeholder" />);
        expect(screen.getByPlaceholderText('Custom Placeholder')).toBeInTheDocument();
    });
});
