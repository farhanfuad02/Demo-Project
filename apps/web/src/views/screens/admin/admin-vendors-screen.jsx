'use client';

/**
 * @file Shop approval queue (FR-G1).
 *
 * @module views/screens/admin/admin-vendors-screen
 */

import { useEffect, useState } from 'react';
import { APPROVAL_STATUS } from '@hungry-ju/shared/enums';
import { useControllerState, useRegistry } from '../../providers/app-provider.jsx';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Modal,
  PageHeader,
  Spinner,
} from '../../ui/primitives.jsx';
import { Field, Select, Textarea } from '../../ui/form.jsx';

/**
 * The vendor approval queue.
 *
 * Rejection demands a reason before the button will fire, because a vendor told only
 * "rejected" has no way to fix the application and will simply resubmit it (FR-G1).
 *
 * @returns {import('react').ReactNode} The screen.
 */
export function AdminVendorsScreen() {
  const registry = useRegistry();
  const state = useControllerState(registry.admin);
  const [queue, setQueue] = useState(APPROVAL_STATUS.PENDING);
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState('');

  useEffect(() => {
    void registry.admin.loadShops(queue);
  }, [registry, queue]);

  const shops = /** @type {import('../../../models/shop-model.js').ShopModel[]} */ (state.shops);

  return (
    <div>
      <PageHeader
        title="Vendor applications"
        subtitle="Only approved shops appear to students."
        action={
          <div className="w-44">
            <Select
              id="queue"
              name="queue"
              value={queue}
              onChange={setQueue}
              options={[
                { value: APPROVAL_STATUS.PENDING, label: 'Pending' },
                { value: APPROVAL_STATUS.APPROVED, label: 'Approved' },
                { value: APPROVAL_STATUS.REJECTED, label: 'Rejected' },
              ]}
            />
          </div>
        }
      />

      <Alert>{state.error}</Alert>

      {state.loading && shops.length === 0 ? (
        <div className="flex justify-center py-10">
          <Spinner label="Loading applications…" />
        </div>
      ) : shops.length === 0 ? (
        <EmptyState title={`No ${queue} applications`} />
      ) : (
        shops.map((shop) => (
          <Card key={shop.id} className="mb-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{shop.shopName}</p>
                <p className="text-ink-soft text-sm">{shop.location}</p>
                <p className="text-ink-soft mt-1 text-sm">
                  Owner: {shop.owner?.fullName ?? '—'} · {shop.contactPhone}
                </p>
                {shop.description ? <p className="mt-2 text-sm">{shop.description}</p> : null}
                {shop.decisionReason ? (
                  <p className="text-ink-soft mt-2 text-sm">Reason: {shop.decisionReason}</p>
                ) : null}
              </div>
              <Badge tone={shop.isApproved ? 'success' : shop.isPending ? 'pending' : 'failure'}>
                {shop.approvalStatus}
              </Badge>
            </div>

            {shop.isPending ? (
              <div className="mt-3 flex gap-2">
                <Button
                  busy={Boolean(state.loading)}
                  onClick={() => registry.admin.decideShop(shop.id, true, undefined, queue)}
                >
                  Approve
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setRejecting(shop);
                    setReason('');
                  }}
                >
                  Reject
                </Button>
              </div>
            ) : null}
          </Card>
        ))
      )}

      <Modal
        open={Boolean(rejecting)}
        title={`Reject ${rejecting?.shopName ?? 'this shop'}?`}
        onDismiss={() => setRejecting(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejecting(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              busy={Boolean(state.loading)}
              disabled={reason.trim().length < 3}
              onClick={async () => {
                await registry.admin.decideShop(rejecting.id, false, reason, queue);
                setRejecting(null);
              }}
            >
              Reject application
            </Button>
          </>
        }
      >
        <Field label="Reason" hint="The vendor sees this and can reapply." required>
          {(id) => (
            <Textarea
              id={id}
              name="reason"
              value={reason}
              onChange={setReason}
              rows={2}
              placeholder="We could not verify this stall at the given location."
            />
          )}
        </Field>
      </Modal>
    </div>
  );
}
