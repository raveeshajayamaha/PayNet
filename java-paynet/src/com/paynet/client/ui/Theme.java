package com.paynet.client.ui;

import javax.swing.*;
import javax.swing.border.EmptyBorder;
import java.awt.*;

/** Shared, dependency-free desktop design tokens and layouts. */
public final class Theme {
    public static final Color BG=new Color(0xF5F7FB), INK=new Color(0x172033), MUTED=new Color(0x64748B),
        BRAND=new Color(0x0F766E), DARK=new Color(0x101827), LINE=new Color(0xE2E8F0), ERROR=new Color(0xB91C1C);
    private Theme() {}
    public static Font font(int size, boolean bold) { return new Font("Segoe UI",bold?Font.BOLD:Font.PLAIN,size); }
    public static void install() {
        UIManager.put("Label.font",font(14,false)); UIManager.put("Label.foreground",INK);
        UIManager.put("TextField.font",font(14,false)); UIManager.put("PasswordField.font",font(14,false));
        UIManager.put("CheckBox.font",font(13,false)); UIManager.put("OptionPane.messageFont",font(14,false));
    }
    public static JLabel label(String s,int size,Color color) { JLabel l=new JLabel(s); l.setAlignmentX(0); l.setFont(font(size,size>=18)); l.setForeground(color); l.setMaximumSize(new Dimension(Integer.MAX_VALUE,l.getFontMetrics(l.getFont()).getHeight())); return l; }
    public static JPanel stack(int gap) {
        JPanel p=new JPanel(){
            @Override protected void addImpl(Component c,Object constraints,int index){
                if(c instanceof JComponent)((JComponent)c).setAlignmentX(0);
                super.addImpl(c,constraints,index);
            }
        };
        p.setOpaque(false); p.setLayout(new BoxLayout(p,BoxLayout.Y_AXIS)); return p;
    }
    public static JPanel row(Component... items) { JPanel p=new JPanel(new FlowLayout(FlowLayout.LEFT,10,0)); p.setOpaque(false); for(Component c:items)p.add(c); return p; }
    public static JPanel card() { JPanel p=new RoundedPanel(Color.WHITE); p.setBorder(new EmptyBorder(22,24,22,24)); return p; }
    public static void field(JTextField f,String name) { f.setFont(font(14,false)); f.setPreferredSize(new Dimension(220,42)); f.setBorder(BorderFactory.createCompoundBorder(BorderFactory.createLineBorder(LINE),new EmptyBorder(10,12,10,12))); f.getAccessibleContext().setAccessibleName(name); }
    public static void entry(JPanel p,String name,JTextField f) { field(f,name); JLabel l=label(name,13,MUTED); l.setLabelFor(f); l.setAlignmentX(0); f.setAlignmentX(0); f.setMaximumSize(new Dimension(Integer.MAX_VALUE,42)); p.add(l); p.add(Box.createVerticalStrut(6)); p.add(f); p.add(Box.createVerticalStrut(16)); }
    public static class RoundedPanel extends JPanel {
        private final Color color;
        public RoundedPanel(Color c) { color=c; setOpaque(false); }
        @Override protected void paintComponent(Graphics g) { Graphics2D x=(Graphics2D)g.create(); x.setRenderingHint(RenderingHints.KEY_ANTIALIASING,RenderingHints.VALUE_ANTIALIAS_ON); x.setColor(color); x.fillRoundRect(0,0,getWidth(),getHeight(),24,24); x.dispose(); super.paintComponent(g); }
    }
}
