package com.paynet.client.ui;
import java.awt.*;
/** Subtle, resolution-independent balance card artwork. */
public class BalanceCard extends Theme.RoundedPanel {
    public BalanceCard(){super(Theme.BRAND);}
    @Override protected void paintComponent(Graphics g){super.paintComponent(g);Graphics2D p=(Graphics2D)g.create();p.setRenderingHint(RenderingHints.KEY_ANTIALIASING,RenderingHints.VALUE_ANTIALIAS_ON);p.setClip(new java.awt.geom.RoundRectangle2D.Double(0,0,getWidth(),getHeight(),24,24));p.setColor(new Color(255,255,255,16));p.setStroke(new BasicStroke(24));p.drawOval(getWidth()-300,-120,360,360);p.setStroke(new BasicStroke(1));p.drawOval(getWidth()-350,-160,440,440);p.dispose();}
}
