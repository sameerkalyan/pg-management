import { Injectable } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';
import { Invoice } from '../../entities/invoice.entity';
import { Tenant } from '../../entities/tenant.entity';
import { Payment } from '../../entities/payment.entity';

@Injectable()
export class PdfService {
  async generateInvoice(invoice: Invoice, tenant: Tenant): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];

      const handleData = (chunk: Buffer) => chunks.push(chunk);
      const handleEnd = () => resolve(Buffer.concat(chunks));
      const handleError = (error: Error) => {
        doc.removeListener('data', handleData);
        doc.removeListener('end', handleEnd);
        reject(error);
      };

      doc.on('data', handleData);
      doc.once('end', handleEnd);
      doc.once('error', handleError);

      // Header
      doc.fontSize(24).text('INVOICE', { align: 'center' });
      doc.moveDown();

      // Invoice Info
      doc.fontSize(12);
      doc.text(`Invoice Number: ${invoice.invoiceNumber}`, { align: 'left' });
      doc.text(`Invoice Date: ${new Date(invoice.createdAt).toLocaleDateString()}`);
      doc.text(`Due Date: ${new Date(invoice.dueDate).toLocaleDateString()}`);
      doc.text(`Billing Period: ${new Date(invoice.billingDate).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}`);
      doc.moveDown();

      // Status Badge
      doc.fontSize(14);
      const statusColor = invoice.status === 'PAID' ? 'green' : 
                         invoice.status === 'OVERDUE' ? 'red' : 'orange';
      doc.fillColor(statusColor).text(`Status: ${invoice.status}`, { align: 'right' });
      doc.fillColor('black');
      doc.moveDown();

      // Tenant Details
      if (tenant) {
        doc.fontSize(14).text('Bill To:', { underline: true });
        doc.moveDown(0.5);
        doc.fontSize(12);
        doc.text(`${tenant.firstName} ${tenant.lastName || ''}`);
        doc.text(`Phone: ${tenant.phoneNumber}`);
        if (tenant.email) doc.text(`Email: ${tenant.email}`);
        
        // Bed and Property info if available
        if (tenant.bed) {
          doc.text(`Bed: ${tenant.bed.bedNumber}`);
          if (tenant.bed.room) {
            doc.text(`Room: ${tenant.bed.room.roomNumber}`);
            if (tenant.bed.room.property) {
              doc.text(`Property: ${tenant.bed.room.property.name}`);
            }
          }
        }
        doc.moveDown();
      } else {
        doc.fontSize(14).text('Bill To:', { underline: true });
        doc.moveDown(0.5);
        doc.fontSize(12);
        doc.text('Tenant information not available');
        doc.moveDown();
      }

      // Invoice Items Table
      doc.fontSize(14).text('Invoice Details', { underline: true });
      doc.moveDown(0.5);
      
      // Table Header
      const tableTop = doc.y;
      doc.fontSize(12).fillColor('black');
      doc.text('Description', 50, tableTop, { width: 300 });
      doc.text('Amount', 400, tableTop, { width: 150, align: 'right' });
      doc.moveDown();
      
      // Draw line under header
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.5);

      // Invoice Type and Amount
      doc.fontSize(11);
      const itemY = doc.y;
      doc.text(`${invoice.type} - ${invoice.description || 'Monthly Rent'}`, 50, itemY, { width: 300 });
      doc.text(`₹${(invoice.amountPaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 400, itemY, { width: 150, align: 'right' });
      doc.moveDown();

      // If there are items, display them
      if (invoice.items && Array.isArray(invoice.items) && invoice.items.length > 0) {
        invoice.items.forEach((item: any) => {
          if (item && item.description && typeof item.amount === 'number') {
            const y = doc.y;
            doc.text(item.description, 50, y, { width: 300 });
            doc.text(`₹${(item.amount / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 400, y, { width: 150, align: 'right' });
            doc.moveDown();
          }
        });
      }

      doc.moveDown();
      
      // Draw line before totals
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.5);

      // Total Amount
      doc.fontSize(14).font('Helvetica-Bold');
      const totalY = doc.y;
      doc.text('Total Amount:', 50, totalY, { width: 300 });
      doc.text(`₹${(invoice.amountPaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 400, totalY, { width: 150, align: 'right' });
      doc.font('Helvetica');
      doc.moveDown();

      // Amount Paid
      if (invoice.amountPaidPaise > 0) {
        doc.fontSize(12);
        const paidY = doc.y;
        doc.text('Amount Paid:', 50, paidY, { width: 300 });
        doc.text(`₹${(invoice.amountPaidPaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 400, paidY, { width: 150, align: 'right' });
        doc.moveDown();

        // Balance Due
        const balanceDue = invoice.amountPaise - invoice.amountPaidPaise;
        if (balanceDue > 0) {
          doc.fontSize(13).font('Helvetica-Bold').fillColor('red');
          const balanceY = doc.y;
          doc.text('Balance Due:', 50, balanceY, { width: 300 });
          doc.text(`₹${(balanceDue / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 400, balanceY, { width: 150, align: 'right' });
          doc.fillColor('black').font('Helvetica');
          doc.moveDown();
        }
      }

      doc.moveDown(2);

      // Payment Status
      if (invoice.status === 'PAID') {
        doc.fontSize(12).fillColor('green');
        doc.text('✓ PAID IN FULL', { align: 'center' });
        doc.fillColor('black');
      } else {
        doc.fontSize(11);
        doc.text('Payment Instructions:', { underline: true });
        doc.text('Please pay by the due date to avoid late fees.');
      }

      doc.moveDown(2);

      // Footer
      doc.fontSize(9).fillColor('gray');
      doc.text('This is a computer-generated invoice.', { align: 'center' });
      doc.text('For any queries, please contact the property manager.', { align: 'center' });
      
      doc.end();
    });
  }

  async generateReceipt(payment: Payment, invoice: Invoice | null, tenant: Tenant | null): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];

      const handleData = (chunk: Buffer) => chunks.push(chunk);
      const handleEnd = () => resolve(Buffer.concat(chunks));
      const handleError = (error: Error) => {
        doc.removeListener('data', handleData);
        doc.removeListener('end', handleEnd);
        reject(error);
      };

      doc.on('data', handleData);
      doc.once('end', handleEnd);
      doc.once('error', handleError);

      doc.fontSize(20).text('Payment Receipt', { align: 'center' });
      doc.moveDown();

      doc.fontSize(12).text(`Receipt ID: ${payment.id}`);
      doc.text(`Payment Number: ${payment.paymentNumber}`);
      doc.text(`Date: ${new Date(payment.createdAt).toLocaleDateString()}`);
      doc.moveDown();

      doc.fontSize(14).text('Payment Details', { underline: true });
      doc.moveDown();
      doc.fontSize(12);
      doc.text(`Amount: ₹${(payment.amountPaise / 100).toFixed(2)}`);
      doc.text(`Method: ${payment.method}`);
      doc.text(`Status: ${payment.status}`);
      doc.text(`Transaction ID: ${payment.transactionId || 'N/A'}`);
      doc.moveDown();

      if (invoice) {
        doc.fontSize(14).text('Invoice Details', { underline: true });
        doc.moveDown();
        doc.fontSize(12);
        doc.text(`Invoice ID: ${invoice.id}`);
        doc.text(`Invoice Number: ${invoice.invoiceNumber}`);
        doc.text(`Due Date: ${new Date(invoice.dueDate).toLocaleDateString()}`);
        doc.text(`Status: ${invoice.status}`);
        doc.moveDown();
      }

      if (tenant) {
        doc.fontSize(14).text('Tenant Details', { underline: true });
        doc.moveDown();
        doc.fontSize(12);
        doc.text(`Name: ${tenant.firstName} ${tenant.lastName || ''}`);
        doc.text(`Phone: ${tenant.phoneNumber}`);
        doc.text(`Email: ${tenant.email || 'N/A'}`);
        doc.moveDown();
      }

      doc.fontSize(10).text('This is a computer-generated receipt.', { align: 'center' });
      doc.end();
    });
  }

  async generateAgreement(tenant: Tenant, property: any, room: any, bed: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];

      const handleData = (chunk: Buffer) => chunks.push(chunk);
      const handleEnd = () => resolve(Buffer.concat(chunks));
      const handleError = (error: Error) => {
        doc.removeListener('data', handleData);
        doc.removeListener('end', handleEnd);
        reject(error);
      };

      doc.on('data', handleData);
      doc.once('end', handleEnd);
      doc.once('error', handleError);

      doc.fontSize(20).text('Tenancy Agreement', { align: 'center' });
      doc.moveDown();

      doc.fontSize(12).text(`Agreement ID: ${tenant.id}`);
      doc.text(`Date: ${new Date().toLocaleDateString()}`);
      doc.moveDown();

      doc.fontSize(14).text('Property Details', { underline: true });
      doc.moveDown();
      doc.fontSize(12);
      doc.text(`Property Name: ${property.name}`);
      doc.text(`Address: ${property.address}`);
      doc.moveDown();

      doc.fontSize(14).text('Room Details', { underline: true });
      doc.moveDown();
      doc.fontSize(12);
      doc.text(`Room Number: ${room.roomNumber}`);
      doc.text(`Floor: ${room.floor}`);
      doc.text(`Bed Number: ${bed.bedNumber}`);
      doc.moveDown();

      doc.fontSize(14).text('Tenant Details', { underline: true });
      doc.moveDown();
      doc.fontSize(12);
      doc.text(`Name: ${tenant.firstName} ${tenant.lastName || ''}`);
      doc.text(`Phone: ${tenant.phoneNumber}`);
      doc.text(`Email: ${tenant.email || 'N/A'}`);
      doc.text(`ID Proof Type: ${tenant.idProofType || 'N/A'}`);
      doc.moveDown();

      doc.fontSize(14).text('Terms and Conditions', { underline: true });
      doc.moveDown();
      doc.fontSize(10);
      doc.text('1. The tenant agrees to pay rent on or before the due date.');
      doc.text('2. The tenant agrees to maintain the room in good condition.');
      doc.text('3. The tenant agrees to follow all rules and regulations of the property.');
      doc.text(
        '4. The landlord reserves the right to terminate the agreement for violation of terms.',
      );
      doc.moveDown();

      doc.fontSize(14).text('Financial Details', { underline: true });
      doc.moveDown();
      doc.fontSize(12);
      doc.text(`Monthly Rent: ₹${Number(bed.rent || 0).toFixed(2)}`);
      doc.text(`Security Deposit: ₹${Number(tenant.securityDeposit || 0).toFixed(2)}`);
      doc.text(`Check-in Date: ${new Date(tenant.checkInDate).toLocaleDateString()}`);
      doc.text(
        `Check-out Date: ${tenant.checkOutDate ? new Date(tenant.checkOutDate).toLocaleDateString() : 'Not specified'}`,
      );
      doc.moveDown();

      doc.fontSize(10).text('This is a legally binding agreement.', { align: 'center' });
      doc.end();
    });
  }
}
