import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CameraDialog } from './CameraDialog';
import { cameraApi } from '../../services/cameraApi';
vi.mock('../../services/cameraApi',()=>({cameraApi:{test:vi.fn(),connect:vi.fn(),update:vi.fn()}}));
describe('CameraDialog',()=>{it('tests connection before enabling connect',async()=>{const user=userEvent.setup();vi.mocked(cameraApi.test).mockResolvedValue({testToken:'token-123',message:'Connection verified'});vi.mocked(cameraApi.connect).mockResolvedValue({} as never);const onSaved=vi.fn();render(<CameraDialog onClose={()=>{}} onSaved={onSaved} notify={()=>{}}/>);await user.type(screen.getByLabelText('Camera name'),'Front Door');await user.type(screen.getByLabelText('IP / hostname'),'192.168.1.20');await user.type(screen.getByLabelText('Username'),'viewer');await user.type(screen.getByLabelText('Password'),'local-test-only');expect(screen.getByRole('button',{name:'Connect camera'})).toBeDisabled();await user.click(screen.getByRole('button',{name:'Test connection'}));await waitFor(()=>expect(cameraApi.test).toHaveBeenCalled());expect(screen.getByRole('dialog').querySelector('.form-result')).toHaveTextContent('Connection verified');await user.click(screen.getByRole('button',{name:'Connect camera'}));await waitFor(()=>expect(cameraApi.connect).toHaveBeenCalledWith('token-123',false));expect(onSaved).toHaveBeenCalled();});});

