package com.paynet.client.ui;
import com.paynet.common.*;
import javax.swing.*;
import javax.swing.table.*;
import javax.swing.border.EmptyBorder;
import java.awt.*;
import java.text.SimpleDateFormat;
import java.util.*;
import java.util.List;

/** Scrollable table with full-value tooltips and server-provided statuses. EDT only. */
public class TransactionHistory extends JPanel {
    private final Model model;
    private final JLabel empty=Theme.label("No transactions yet. Your payments will appear here.",14,Theme.MUTED);
    public TransactionHistory(){this(new Model());}
    public TransactionHistory sharedView(){return new TransactionHistory(model);}
    private TransactionHistory(Model shared){super(new BorderLayout(0,12));model=shared;setOpaque(false);
        model.addTableModelListener(e->empty.setVisible(model.rows.isEmpty()));
        JTable table=new JTable(model){@Override public String getToolTipText(java.awt.event.MouseEvent e){int r=rowAtPoint(e.getPoint()),c=columnAtPoint(e.getPoint());return r<0||c<0?null:String.valueOf(getValueAt(r,c));}};
        table.setFont(Theme.font(13,false));table.setForeground(Theme.INK);table.setRowHeight(46);table.setShowGrid(false);table.setIntercellSpacing(new Dimension(0,0));table.setSelectionBackground(new Color(0xCCFBF1));table.setSelectionForeground(Theme.INK);table.setFillsViewportHeight(true);table.setAutoResizeMode(JTable.AUTO_RESIZE_OFF);table.getTableHeader().setReorderingAllowed(false);table.getTableHeader().setFont(Theme.font(12,true));table.getTableHeader().setBackground(Theme.BG);table.getTableHeader().setForeground(Theme.MUTED);table.getTableHeader().setPreferredSize(new Dimension(0,40));
        int[] widths={72,160,100,130,185,130,250};for(int i=0;i<widths.length;i++){table.getColumnModel().getColumn(i).setPreferredWidth(widths[i]);table.getColumnModel().getColumn(i).setMinWidth(widths[i]);}
        table.setDefaultRenderer(Object.class,new DefaultTableCellRenderer(){@Override public Component getTableCellRendererComponent(JTable t,Object v,boolean sel,boolean focus,int r,int c){super.getTableCellRendererComponent(t,v,sel,focus,r,c);setBorder(new EmptyBorder(0,12,0,12));setHorizontalAlignment(c==3?RIGHT:LEFT);if(!sel){setBackground(r%2==0?Color.WHITE:new Color(0xFAFBFD));setForeground(c==3?(String.valueOf(v).startsWith("+")?Theme.BRAND:Theme.ERROR):Theme.INK);}return this;}});
        JScrollPane scroll=new JScrollPane(table);scroll.setBorder(BorderFactory.createLineBorder(Theme.LINE));scroll.getViewport().setBackground(Color.WHITE);add(scroll,BorderLayout.CENTER);add(empty,BorderLayout.SOUTH);
    }
    public void setAll(List<Transaction> rows,String user){model.me=user;model.rows.clear();model.rows.addAll(rows);model.fireTableDataChanged();empty.setVisible(rows.isEmpty());}
    public void clear(){setAll(Collections.emptyList(),"");}
    public void add(Transaction t){for(Transaction old:model.rows)if(old.getId()==t.getId())return;model.rows.add(0,t);model.fireTableRowsInserted(0,0);empty.setVisible(false);}
    private static class Model extends AbstractTableModel {
        final List<Transaction> rows=new ArrayList<>();String me="";final String[] names={"ID","Counterparty","Type","Amount","Date / time","Status","Note"};final SimpleDateFormat date=new SimpleDateFormat("dd MMM yyyy, HH:mm:ss");
        public int getRowCount(){return rows.size();}public int getColumnCount(){return names.length;}public String getColumnName(int c){return names[c];}
        public Object getValueAt(int r,int c){Transaction t=rows.get(r);boolean in=t.getTo().equals(me);switch(c){case 0:return t.getId();case 1:return in?t.getFrom():t.getTo();case 2:return t.getFrom().equals("SYSTEM")?"Deposit":in?"Received":"Sent";case 3:return(in?"+":"-")+Money.format(t.getCents());case 4:return date.format(new Date(t.getTimestamp()));case 5:return t.getStatus();default:return t.getNote();}}
    }
}
